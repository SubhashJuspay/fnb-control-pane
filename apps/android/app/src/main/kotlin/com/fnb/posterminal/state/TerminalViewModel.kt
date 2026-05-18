package com.fnb.posterminal.state

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.fnb.posterminal.ws.ConnectionState
import com.fnb.posterminal.ws.PaymentResultStatus
import com.fnb.posterminal.ws.ServerMessage
import com.fnb.posterminal.ws.TerminalSocket
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * UI-facing state for the whole terminal app. Three top-level screens are
 * derived from this:
 *
 *   1. Settings — when `settings.isComplete()` is false
 *   2. Idle     — connected, no active payment
 *   3. Payment  — `activePayment` is non-null
 */
class TerminalViewModel(
    private val settingsRepo: SettingsRepository,
    private val socket: TerminalSocket = TerminalSocket(),
) : ViewModel() {

    val settings: StateFlow<TerminalSettings> = settingsRepo.settings
        .stateIn(
            scope = viewModelScope,
            started = SharingStarted.Eagerly,
            initialValue = TerminalSettings("", "", ""),
        )

    val connection: StateFlow<ConnectionState> = socket.state

    private val _activePayment = MutableStateFlow<ServerMessage.PaymentRequest?>(null)
    val activePayment: StateFlow<ServerMessage.PaymentRequest?> = _activePayment.asStateFlow()

    init {
        // Listen for `payment_request` and `payment_cancel` frames forever.
        // The current intent slot only holds one at a time — if a new one
        // arrives we replace the previous (server-side timer would have
        // already declined it).
        viewModelScope.launch {
            socket.messages.collect { msg ->
                when (msg) {
                    is ServerMessage.PaymentRequest -> _activePayment.value = msg
                    is ServerMessage.PaymentCancel -> {
                        if (_activePayment.value?.intentId == msg.intentId) {
                            _activePayment.value = null
                        }
                    }
                    else -> Unit
                }
            }
        }
        // React to settings changes: reconnect with the new slugs whenever
        // the user edits and saves.
        viewModelScope.launch {
            settings.collect { s ->
                if (s.isComplete()) {
                    socket.connect(
                        TerminalSocket.Config(
                            baseUrl = s.baseUrl,
                            tenantSlug = s.tenantSlug,
                            locationSlug = s.locationSlug,
                        ),
                    )
                } else {
                    socket.disconnect()
                }
            }
        }
    }

    fun saveSettings(value: TerminalSettings) {
        viewModelScope.launch { settingsRepo.save(value) }
    }

    fun approve() {
        val active = _activePayment.value ?: return
        socket.sendResult(active.intentId, PaymentResultStatus.APPROVED)
        _activePayment.value = null
    }

    fun decline() {
        val active = _activePayment.value ?: return
        socket.sendResult(active.intentId, PaymentResultStatus.DECLINED)
        _activePayment.value = null
    }

    fun cancel() {
        val active = _activePayment.value ?: return
        socket.sendResult(active.intentId, PaymentResultStatus.CANCELLED)
        _activePayment.value = null
    }

    override fun onCleared() {
        super.onCleared()
        socket.shutdown()
    }

    class Factory(private val settingsRepo: SettingsRepository) : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            require(modelClass.isAssignableFrom(TerminalViewModel::class.java))
            return TerminalViewModel(settingsRepo) as T
        }
    }
}
