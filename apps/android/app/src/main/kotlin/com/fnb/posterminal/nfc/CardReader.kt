package com.fnb.posterminal.nfc

/**
 * Abstract "wait for a card tap" surface. Two implementations:
 *
 *   - [StockNfcReader]   — uses Android's `NfcAdapter.enableReaderMode`.
 *     Works on most modern phones and a few POS devices.
 *   - [SunmiCardReader]  — talks to SPHS via the Sunmi Pay SDK. Works on
 *     Sunmi POS devices where the NFC chip is owned by the vendor and not
 *     exposed via the stock NFC API.
 *
 * `MainActivity` prefers Sunmi when bind succeeds; otherwise stock NFC;
 * otherwise none (a manual "Simulate card tap" button is shown).
 */
interface CardReader {

    /** Optional human-readable name for logs / debug UI. */
    val displayName: String

    /**
     * Begin listening for card taps. Idempotent — safe to call when already
     * active. `onTagDetected` is dispatched on the main thread. The `uuid`
     * is the NFC tag's identifier (hex string) when the underlying reader
     * exposes one — used to debounce the same physical card sitting in
     * the antenna field across back-to-back payments.
     */
    fun start(onTagDetected: (uuid: String?) -> Unit)

    /** Stop listening. Idempotent — safe to call when not active. */
    fun stop()

    /** Tear down — disconnect, unbind, release resources. */
    fun shutdown()
}
