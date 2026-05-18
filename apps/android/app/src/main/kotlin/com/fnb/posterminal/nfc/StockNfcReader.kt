package com.fnb.posterminal.nfc

import android.app.Activity
import android.nfc.NfcAdapter
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Stock Android NFC reader. Wraps `NfcAdapter.enableReaderMode`. We don't
 * read EMV data — the demo just needs to know that any NFC tag came near
 * the device. Real EMV processing would happen via a card-network SDK; this
 * is the gesture-only stand-in.
 */
class StockNfcReader(private val activity: Activity) : CardReader {

    private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)
    private val vibrator: Vibrator? = obtainVibrator()
    private var active: Boolean = false

    override val displayName: String = "Stock NFC"

    /** True iff the device has an NFC chip exposed to third-party apps. */
    val isSupported: Boolean get() = adapter != null

    override fun start(onTagDetected: () -> Unit) {
        val a = adapter ?: return
        if (!a.isEnabled) {
            Log.w(TAG, "NFC adapter present but disabled in system settings")
            return
        }
        a.enableReaderMode(
            activity,
            { _ ->
                buzz()
                activity.runOnUiThread(onTagDetected)
            },
            NfcAdapter.FLAG_READER_NFC_A or
                NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or
                NfcAdapter.FLAG_READER_NFC_V or
                NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
                NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
            null,
        )
        active = true
        Log.i(TAG, "reader mode enabled")
    }

    override fun stop() {
        if (!active) return
        adapter?.disableReaderMode(activity)
        active = false
        Log.i(TAG, "reader mode disabled")
    }

    override fun shutdown() {
        stop()
    }

    private fun buzz() {
        val v = vibrator ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v.vibrate(VibrationEffect.createOneShot(80L, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                v.vibrate(80L)
            }
        } catch (_: Throwable) {
            // ignored — haptic is best-effort
        }
    }

    private fun obtainVibrator(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val mgr = ContextCompat.getSystemService(activity, VibratorManager::class.java)
            mgr?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            ContextCompat.getSystemService(activity, Vibrator::class.java)
        }
    }

    companion object {
        private const val TAG = "StockNfcReader"
    }
}
