package com.fnb.posterminal.printer

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.os.IBinder
import android.util.Log
import woyou.aidlservice.jiuiv5.ICallback
import woyou.aidlservice.jiuiv5.IWoyouService
import java.text.NumberFormat
import java.text.SimpleDateFormat
import java.util.Currency
import java.util.Date
import java.util.Locale

/**
 * Wraps the Sunmi InnerPrinter system service. On Sunmi POS devices this
 * service is pre-installed; on every other device the bind silently fails
 * and `isAvailable` stays false.
 *
 * The service is async (every method takes a callback that fires after
 * printing). We pass a no-op callback for fire-and-forget; receipt printing
 * is non-critical to the payment flow so we don't gate the UI on it.
 */
class ReceiptPrinter(private val appContext: Context) {

    private var service: IWoyouService? = null
    private var bindAttempted: Boolean = false

    /** True after onServiceConnected has fired. */
    val isAvailable: Boolean get() = service != null

    private val connection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: IBinder?) {
            service = IWoyouService.Stub.asInterface(binder)
            Log.i(TAG, "InnerPrinter service connected")
        }

        override fun onServiceDisconnected(name: ComponentName?) {
            Log.w(TAG, "InnerPrinter service disconnected")
            service = null
        }
    }

    /**
     * Bind on app start. Returns whether the bind request was accepted —
     * not whether the service is actually present. Watch `isAvailable`
     * for that, or just call [printReceipt] which no-ops cleanly.
     */
    fun bind(): Boolean {
        if (bindAttempted) return service != null
        bindAttempted = true
        val intent = Intent().apply {
            setAction("woyou.aidlservice.jiuiv5.IWoyouService")
            setPackage("woyou.aidlservice.jiuiv5")
        }
        return try {
            appContext.bindService(intent, connection, Context.BIND_AUTO_CREATE).also {
                Log.i(TAG, "bindService returned $it")
            }
        } catch (t: Throwable) {
            Log.w(TAG, "bindService threw: ${t.message}")
            false
        }
    }

    fun unbind() {
        if (!bindAttempted) return
        try {
            appContext.unbindService(connection)
        } catch (_: Throwable) {
            // already gone
        }
        service = null
        bindAttempted = false
    }

    fun printReceipt(receipt: Receipt) {
        val svc = service
        if (svc == null) {
            Log.i(TAG, "skip print — printer not bound (non-Sunmi device or service missing)")
            return
        }
        try {
            svc.printerInit(noop)

            // Header — centred, larger size.
            svc.setAlignment(ALIGN_CENTER, noop)
            svc.setFontSize(30f, noop)
            svc.printText(receipt.tenantName + "\n", noop)
            svc.setFontSize(22f, noop)
            svc.printText(receipt.locationName + "\n", noop)
            svc.lineWrap(1, noop)

            // Order metadata — left-aligned, standard size.
            svc.setAlignment(ALIGN_LEFT, noop)
            svc.setFontSize(24f, noop)
            svc.printText(divider() + "\n", noop)
            svc.printText("Order #${receipt.shortNumber}\n", noop)
            if (!receipt.tableLabel.isNullOrBlank()) {
                svc.printText("Table: ${receipt.tableLabel}\n", noop)
            }
            svc.printText("Customer: ${receipt.customerName}\n", noop)
            svc.printText("${formatTimestamp(receipt.timestamp)}\n", noop)
            svc.printText(divider() + "\n", noop)
            svc.lineWrap(1, noop)

            // Items — two columns: "qty × name" left-aligned, price right.
            for (item in receipt.items) {
                svc.printColumnsText(
                    arrayOf("${item.qty} × ${item.name}", formatMoney(item.lineTotalCents, receipt.currency)),
                    intArrayOf(COL_ITEM_WIDTH, COL_PRICE_WIDTH),
                    intArrayOf(ALIGN_LEFT, ALIGN_RIGHT),
                    noop,
                )
                if (item.modifiers.isNotEmpty()) {
                    svc.printText("    ${item.modifiers.joinToString(" · ")}\n", noop)
                }
            }
            svc.printText(divider() + "\n", noop)

            // Total — bolder/bigger.
            svc.setFontSize(28f, noop)
            svc.printColumnsText(
                arrayOf("TOTAL", formatMoney(receipt.amountCents, receipt.currency)),
                intArrayOf(COL_ITEM_WIDTH, COL_PRICE_WIDTH),
                intArrayOf(ALIGN_LEFT, ALIGN_RIGHT),
                noop,
            )
            svc.setFontSize(24f, noop)
            svc.lineWrap(1, noop)

            // Footer — centred.
            svc.setAlignment(ALIGN_CENTER, noop)
            svc.printText("Paid by Card · NFC\n", noop)
            svc.printText("Approved · #${receipt.shortNumber}\n", noop)
            svc.lineWrap(2, noop)
            svc.setFontSize(28f, noop)
            svc.printText("Thank you!\n", noop)
            svc.lineWrap(4, noop)

            // Some Sunmi printers auto-feed-and-cut; others need explicit.
            try {
                svc.cutPaper(noop)
            } catch (_: Throwable) {
                // not all models support cutting; ignore
            }
        } catch (t: Throwable) {
            Log.w(TAG, "printReceipt failed: ${t.message}")
        }
    }

    /** A no-op callback; we don't await print results. */
    private val noop = object : ICallback.Stub() {
        override fun onRunResult(isSuccess: Boolean) {}
        override fun onReturnString(result: String?) {}
        override fun onRaiseException(code: Int, msg: String?) {
            Log.w(TAG, "printer exception code=$code msg=$msg")
        }
        override fun onPrintResult(code: Int, msg: String?) {
            // code 0 == success per Sunmi docs
            if (code != 0) Log.w(TAG, "printer onPrintResult code=$code msg=$msg")
        }
    }

    companion object {
        private const val TAG = "ReceiptPrinter"
        private const val ALIGN_LEFT = 0
        private const val ALIGN_CENTER = 1
        private const val ALIGN_RIGHT = 2

        // Sunmi 58mm thermal paper fits ~32 columns of the default font. The
        // V2 / T2 88mm models support ~48; either way these widths are
        // soft hints — the printer auto-wraps if a cell overflows.
        private const val COL_ITEM_WIDTH = 22
        private const val COL_PRICE_WIDTH = 10

        private fun divider(): String = "-".repeat(32)

        private fun formatMoney(amountCents: Long, currencyCode: String): String {
            val fmt = NumberFormat.getCurrencyInstance(Locale.US)
            runCatching { fmt.currency = Currency.getInstance(currencyCode) }
            return fmt.format(amountCents / 100.0)
        }

        private fun formatTimestamp(ts: Long): String {
            val fmt = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US)
            return fmt.format(Date(ts))
        }
    }
}

/** Plain-data receipt for [ReceiptPrinter.printReceipt]. */
data class Receipt(
    val tenantName: String,
    val locationName: String,
    val shortNumber: Int,
    val customerName: String,
    val tableLabel: String?,
    val amountCents: Long,
    val currency: String,
    val items: List<ReceiptItem>,
    val timestamp: Long,
)

data class ReceiptItem(
    val qty: Int,
    val name: String,
    val lineTotalCents: Long,
    val modifiers: List<String>,
)
