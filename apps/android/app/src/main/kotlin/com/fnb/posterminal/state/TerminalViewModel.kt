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
 * Brief outcome shown on the POS device for ~3s after a payment is dispatched
 * upstream. Mirrors what a real card terminal does — "Approved" stays on
 * screen long enough that the operator can confirm the transaction landed.
 */
sealed interface LastResult {
    val shortNumber: Int
    val amountCents: Long
    val currency: String

    data class Approved(
        override val shortNumber: Int,
        override val amountCents: Long,
        override val currency: String,
    ) : LastResult

    data class Declined(
        override val shortNumber: Int,
        override val amountCents: Long,
        override val currency: String,
    ) : LastResult

    data class Cancelled(
        override val shortNumber: Int,
        override val amountCents: Long,
        override val currency: String,
    ) : LastResult
}

/**
 * UI-facing state for the whole terminal app. Four top-level screens are
 * derived from this:
 *
 *   1. Settings — when `settings.isComplete()` is false
 *   2. Idle     — connected, no active payment, no recent result
 *   3. Payment  — `activePayment` is non-null
 *   4. Result   — last payment outcome; cleared explicitly by the operator
 *                 tapping Done (no auto-dismiss — cashier needs to confirm
 *                 the receipt printed before moving on).
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

    private val _lastResult = MutableStateFlow<LastResult?>(null)
    val lastResult: StateFlow<LastResult?> = _lastResult.asStateFlow()

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
        showResult(
            LastResult.Approved(
                shortNumber = active.shortNumber,
                amountCents = active.amountCents,
                currency = active.currency,
            ),
        )
        _activePayment.value = null
    }

    fun decline() {
        val active = _activePayment.value ?: return
        socket.sendResult(active.intentId, PaymentResultStatus.DECLINED)
        showResult(
            LastResult.Declined(
                shortNumber = active.shortNumber,
                amountCents = active.amountCents,
                currency = active.currency,
            ),
        )
        _activePayment.value = null
    }

    fun cancel() {
        val active = _activePayment.value ?: return
        socket.sendResult(active.intentId, PaymentResultStatus.CANCELLED)
        showResult(
            LastResult.Cancelled(
                shortNumber = active.shortNumber,
                amountCents = active.amountCents,
                currency = active.currency,
            ),
        )
        _activePayment.value = null
    }

    fun clearLastResult() {
        _lastResult.value = null
    }

    private fun showResult(result: LastResult) {
        _lastResult.value = result
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
