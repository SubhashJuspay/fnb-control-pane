package com.fnb.posterminal

import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.fnb.posterminal.nfc.CardReader
import com.fnb.posterminal.nfc.StockNfcReader
import com.fnb.posterminal.nfc.SunmiCardReader
import com.fnb.posterminal.printer.Receipt
import com.fnb.posterminal.printer.ReceiptItem
import com.fnb.posterminal.printer.ReceiptPrinter
import com.fnb.posterminal.state.SettingsRepository
import com.fnb.posterminal.state.TerminalViewModel
import com.fnb.posterminal.ui.IdleScreen
import com.fnb.posterminal.ui.PaymentScreen
import com.fnb.posterminal.ui.PosTerminalTheme
import com.fnb.posterminal.ui.ResultScreen
import com.fnb.posterminal.ui.SettingsScreen
import com.fnb.posterminal.ws.ConnectionState
import com.fnb.posterminal.ws.ServerMessage
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Single activity, full-screen, portrait. Owns:
 *   - the TerminalViewModel + its WebSocket
 *   - a CardReader picked at runtime: SunmiCardReader on Sunmi POS hardware,
 *     StockNfcReader on phones with a standard NfcAdapter, neither on
 *     emulators / non-NFC tablets (the PaymentScreen falls back to its
 *     manual "Simulate card tap" button in that case).
 *   - a ReceiptPrinter that prints to the Sunmi InnerPrinter when present;
 *     silently no-ops on non-Sunmi devices.
 */
class MainActivity : ComponentActivity() {

    private val viewModel: TerminalViewModel by viewModels {
        TerminalViewModel.Factory(SettingsRepository(applicationContext))
    }

    private lateinit var sunmiReader: SunmiCardReader
    private lateinit var stockReader: StockNfcReader
    private lateinit var receiptPrinter: ReceiptPrinter

    @Volatile private var activeReader: CardReader? = null
    @Volatile private var sunmiAvailable: Boolean = false

    /** Last printed receipt — kept around so the operator can Reprint from
     *  the ResultScreen without re-doing the payment. Cleared on Done. */
    @Volatile private var lastReceipt: Receipt? = null

    private var paymentInFlight: Boolean = false
    private var sunmiBindWatchdog: Job? = null

    /**
     * Elapsed-realtime ms at which the last tap was approved. Taps fired
     * within `APPROVE_COOLDOWN_MS` of this are dropped — Sunmi's NFC SDK
     * occasionally emits a second `findRFCard` event for the same physical
     * tap (the card is still inside the antenna field when the next
     * payment dispatches), and without this debounce the stale tap lands
     * on the freshly-armed intent and silently approves it.
     */
    @Volatile private var lastApproveAt: Long = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        stockReader = StockNfcReader(this)
        sunmiReader = SunmiCardReader(this, onReady = ::onSunmiConnected)
        receiptPrinter = ReceiptPrinter(applicationContext).also { it.bind() }

        val sunmiInitStarted = sunmiReader.init()
        if (sunmiInitStarted) {
            Log.i(TAG, "Sunmi initPaySDK returned true — waiting for bind")
            armSunmiWatchdog()
            useStockReaderIfPossible()
        } else {
            Log.i(TAG, "Sunmi initPaySDK returned false — using stock NFC")
            useStockReaderIfPossible()
        }

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                viewModel.activePayment.collect { active ->
                    paymentInFlight = active != null
                    if (paymentInFlight) {
                        activeReader?.start { doApprove() }
                    } else {
                        activeReader?.stop()
                    }
                }
            }
        }

        setContent {
            PosTerminalTheme {
                Root(
                    viewModel = viewModel,
                    hasNfc = ::hasAnyReader,
                    hasPrinter = { receiptPrinter.isAvailable },
                    onApprove = ::doApprove,
                    onReprint = ::reprintLastReceipt,
                    onDismissResult = ::dismissResult,
                )
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (paymentInFlight) activeReader?.start { doApprove() }
    }

    override fun onPause() {
        super.onPause()
        activeReader?.stop()
    }

    override fun onDestroy() {
        sunmiBindWatchdog?.cancel()
        try { sunmiReader.shutdown() } catch (_: Throwable) {}
        try { stockReader.shutdown() } catch (_: Throwable) {}
        try { receiptPrinter.unbind() } catch (_: Throwable) {}
        super.onDestroy()
    }

    /**
     * Single funnel for "approve this payment". Both the NFC reader
     * callback and the PaymentScreen's manual button (on no-NFC devices)
     * land here so receipts always print regardless of which path fired.
     */
    private fun doApprove() {
        // Stale-tap guard: Sunmi's NFC SDK sometimes fires a second
        // findRFCard for the same physical tap. If we just left a payment
        // a moment ago and a fresh one armed, that second event would land
        // on the new intent — the cashier sees a ticket close before the
        // customer has even tapped. Drop taps in the cooldown window.
        val now = SystemClock.elapsedRealtime()
        if (now - lastApproveAt < APPROVE_COOLDOWN_MS) {
            Log.w(
                TAG,
                "doApprove ignored — ${now - lastApproveAt}ms since last approve (cooldown ${APPROVE_COOLDOWN_MS}ms)",
            )
            return
        }
        // Snapshot the active payment + connection before approve() clears
        // them — the receipt needs item names, amounts, customer, and the
        // tenant/location for the header.
        val payment = viewModel.activePayment.value ?: return
        lastApproveAt = now
        val conn = viewModel.connection.value
        viewModel.approve()
        val receipt = buildReceipt(payment, conn)
        lastReceipt = receipt
        receiptPrinter.printReceipt(receipt)
    }

    private fun reprintLastReceipt() {
        val r = lastReceipt ?: return
        receiptPrinter.printReceipt(r)
    }

    private fun dismissResult() {
        lastReceipt = null
        viewModel.clearLastResult()
    }

    private fun buildReceipt(
        payment: ServerMessage.PaymentRequest,
        connection: ConnectionState,
    ): Receipt {
        val (tenant, location) = when (connection) {
            is ConnectionState.Connected -> connection.tenantName to connection.locationName
            else -> "" to ""
        }
        return Receipt(
            tenantName = tenant,
            locationName = location,
            shortNumber = payment.shortNumber,
            customerName = payment.customerName,
            tableLabel = payment.tableLabel,
            amountCents = payment.amountCents,
            currency = payment.currency,
            items = payment.items.map {
                ReceiptItem(
                    qty = it.qty,
                    name = it.name,
                    lineTotalCents = it.lineTotalCents,
                    modifiers = it.modifiers,
                )
            },
            timestamp = System.currentTimeMillis(),
        )
    }

    private fun onSunmiConnected() {
        sunmiBindWatchdog?.cancel()
        sunmiAvailable = true
        if (activeReader === sunmiReader) return
        Log.i(TAG, "Sunmi connected — swapping in")
        activeReader?.stop()
        activeReader = sunmiReader
        if (paymentInFlight) sunmiReader.start { doApprove() }
    }

    private fun useStockReaderIfPossible() {
        if (!stockReader.isSupported) {
            Log.i(TAG, "No stock NFC adapter — running without a card reader")
            activeReader = null
            return
        }
        activeReader = stockReader
        if (paymentInFlight) stockReader.start { doApprove() }
    }

    private fun armSunmiWatchdog() {
        sunmiBindWatchdog?.cancel()
        sunmiBindWatchdog = lifecycleScope.launch {
            delay(SUNMI_BIND_TIMEOUT_MS)
            if (!sunmiAvailable) {
                Log.i(TAG, "Sunmi bind didn't complete in time — sticking with stock NFC")
            }
        }
    }

    private fun hasAnyReader(): Boolean = activeReader != null

    companion object {
        private const val TAG = "MainActivity"
        private const val SUNMI_BIND_TIMEOUT_MS = 2000L

        /**
         * Minimum gap between two consecutive NFC approves. Long enough to
         * debounce Sunmi's accidental double-emit but short enough that a
         * real cashier can chain payments back-to-back.
         */
        private const val APPROVE_COOLDOWN_MS = 2500L
    }
}

@Composable
private fun Root(
    viewModel: TerminalViewModel,
    hasNfc: () -> Boolean,
    hasPrinter: () -> Boolean,
    onApprove: () -> Unit,
    onReprint: () -> Unit,
    onDismissResult: () -> Unit,
) {
    val settings by viewModel.settings.collectAsState()
    val connection by viewModel.connection.collectAsState()
    val activePayment by viewModel.activePayment.collectAsState()
    val lastResult by viewModel.lastResult.collectAsState()

    var editingSettings by remember { mutableStateOf(false) }

    when {
        !settings.isComplete() || editingSettings -> SettingsScreen(
            initial = settings,
            onSave = {
                viewModel.saveSettings(it)
                editingSettings = false
            },
        )
        activePayment != null -> PaymentScreen(
            payment = activePayment!!,
            nfcAvailable = hasNfc(),
            // Manual "Simulate card tap" route on no-NFC devices: routed
            // through the activity's doApprove so the receipt still prints.
            onApprove = onApprove,
            onDecline = { viewModel.decline() },
            onCancel = { viewModel.cancel() },
        )
        lastResult != null -> ResultScreen(
            result = lastResult!!,
            printerAvailable = hasPrinter(),
            onReprint = onReprint,
            onDismiss = onDismissResult,
        )
        else -> IdleScreen(
            connection = connection,
            onEditSettings = { editingSettings = true },
        )
    }
}
