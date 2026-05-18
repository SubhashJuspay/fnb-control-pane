package com.fnb.posterminal.ws

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.TimeUnit

/**
 * Connection state surfaced to the UI. Drives the "Connected · …" indicator
 * on the idle screen.
 */
sealed interface ConnectionState {
    data object Connecting : ConnectionState
    data class Connected(val tenantName: String, val locationName: String) : ConnectionState
    data class Disconnected(val reason: String) : ConnectionState
}

/**
 * Long-lived WebSocket connection to the API's `/pos-terminal` endpoint.
 *
 * Lifecycle:
 *   - Call `connect(...)` once on startup (and again when settings change).
 *   - Listen on `state` for connection status.
 *   - Listen on `messages` for incoming `ServerMessage.PaymentRequest` events.
 *   - Send results back via `sendResult(...)`.
 *
 * Reconnection: exponential backoff capped at 30s. Any non-1000 close, the
 * server going away, or a transient socket error all flow through the same
 * retry path.
 */
class TerminalSocket(
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) {
    private val json = Json {
        ignoreUnknownKeys = true
        classDiscriminator = "type"
        encodeDefaults = true
    }

    // OkHttp's default 10s ping is fine; the server also pings us back on a
    // 25s cadence so a one-sided NAT timeout still trips a close+reconnect.
    private val http = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS) // long-lived
        .build()

    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected("idle"))
    val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val _messages = MutableSharedFlow<ServerMessage>(
        replay = 0,
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val messages: SharedFlow<ServerMessage> = _messages.asSharedFlow()

    private var socket: WebSocket? = null
    private var connectJob: Job? = null
    private var reconnectAttempt: Int = 0
    private var lastConfig: Config? = null

    data class Config(
        val baseUrl: String,
        val tenantSlug: String,
        val locationSlug: String,
    )

    fun connect(config: Config) {
        lastConfig = config
        connectJob?.cancel()
        connectJob = scope.launch { connectLoop(config) }
    }

    fun disconnect() {
        connectJob?.cancel()
        connectJob = null
        socket?.close(1000, "client disconnect")
        socket = null
        _state.value = ConnectionState.Disconnected("disconnected")
    }

    fun sendResult(intentId: String, status: PaymentResultStatus) {
        val msg = ClientMessage.PaymentResult(intentId = intentId, status = status)
        val frame = json.encodeToString(ClientMessage.serializer(), msg)
        val sent = socket?.send(frame) ?: false
        if (!sent) {
            Log.w(TAG, "sendResult failed (socket null or buffer full)")
        }
    }

    fun shutdown() {
        disconnect()
        scope.cancel()
    }

    private suspend fun connectLoop(config: Config) {
        while (true) {
            reconnectAttempt += 1
            _state.value = ConnectionState.Connecting
            val ws = openSocket(config)
            socket = ws
            // openSocket suspends until the socket either reaches CONNECTED
            // or fails. Either way the listener updates _state, so we wait
            // here until something closes the socket — then back off.
            awaitClose()
            val backoff = computeBackoffMillis(reconnectAttempt)
            Log.i(TAG, "reconnecting in ${backoff}ms (attempt $reconnectAttempt)")
            delay(backoff)
        }
    }

    private val closeSignal = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    private suspend fun awaitClose() {
        // First emission after `openSocket` resolves means the socket closed
        // or errored; consume one and bounce.
        closeSignal.collect { return@collect }
    }

    private fun openSocket(config: Config): WebSocket {
        val wsUrl = buildWsUrl(config)
        Log.i(TAG, "connecting $wsUrl")
        val req = Request.Builder().url(wsUrl).build()
        return http.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.i(TAG, "onOpen")
                // We don't flip to Connected until the server sends `ready` —
                // that's our handshake confirmation that the slugs validated.
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                val msg = try {
                    json.decodeFromString(ServerMessage.serializer(), text)
                } catch (t: Throwable) {
                    Log.w(TAG, "drop bad frame: ${t.message} :: $text")
                    return
                }
                when (msg) {
                    is ServerMessage.Ready -> {
                        reconnectAttempt = 0
                        _state.value = ConnectionState.Connected(
                            tenantName = msg.tenantName,
                            locationName = msg.locationName,
                        )
                    }
                    is ServerMessage.Pong -> { /* heartbeat */ }
                    is ServerMessage.PaymentRequest -> {
                        scope.launch { _messages.emit(msg) }
                    }
                    is ServerMessage.PaymentCancel -> {
                        scope.launch { _messages.emit(msg) }
                    }
                }
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                // Server only sends text frames; ignore binary.
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "onClosing $code $reason")
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                Log.i(TAG, "onClosed $code $reason")
                _state.value = ConnectionState.Disconnected("closed: $reason")
                closeSignal.tryEmit(Unit)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.w(TAG, "onFailure ${t.message}")
                _state.value = ConnectionState.Disconnected(t.message ?: "failure")
                closeSignal.tryEmit(Unit)
            }
        })
    }

    companion object {
        private const val TAG = "TerminalSocket"

        fun buildWsUrl(config: Config): String {
            // Accept either http(s):// or ws(s):// from settings; we normalise
            // to ws/wss so the customer doesn't need to remember the protocol
            // mapping.
            val base = config.baseUrl.trim().removeSuffix("/")
                .replaceFirst("^https://".toRegex(), "wss://")
                .replaceFirst("^http://".toRegex(), "ws://")
                .let { if (it.startsWith("ws://") || it.startsWith("wss://")) it else "wss://$it" }
            return "$base/pos-terminal?tenantSlug=${config.tenantSlug}&locationSlug=${config.locationSlug}"
        }

        fun computeBackoffMillis(attempt: Int): Long {
            // 1s, 2s, 4s, … capped at 30s. Random jitter avoids reconnect
            // storms when the API restarts.
            val base = 1000L * (1L shl minOf(attempt - 1, 5))
            val jitter = (Math.random() * 250).toLong()
            return minOf(base + jitter, 30_000L)
        }
    }
}
