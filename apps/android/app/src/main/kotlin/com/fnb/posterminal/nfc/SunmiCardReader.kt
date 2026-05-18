package com.fnb.posterminal.nfc

import android.app.Activity
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.RemoteException
import android.util.Log
import com.sunmi.pay.hardware.aidl.AidlConstants
import com.sunmi.pay.hardware.aidlv2.readcard.CheckCardCallbackV2
import com.sunmi.pay.hardware.aidlv2.readcard.ReadCardOptV2
import sunmi.paylib.SunmiPayKernel

/**
 * Card reader for Sunmi POS devices. Talks to SPHS (Sunmi Pay Hardware
 * Service) via the Sunmi Pay SDK. The flow:
 *
 *   1. `initPaySDK` binds to SPHS. On `onConnectPaySDK` we grab the
 *      `mReadCardOptV2` handle and call `onReady` so the activity knows
 *      this reader is live.
 *   2. `start(onTap)` invokes `checkCard(NFC, callback, timeout)`. When a
 *      card comes near, `findRFCard(uuid)` fires on a binder thread; we
 *      hop back to the main thread and call `onTap`.
 *   3. `stop()` calls `cancelCheckCard()` + `cardOff()` to power down the
 *      radio (the SDK doc warns the device will overheat otherwise).
 *   4. `shutdown()` unbinds the service.
 *
 * If SPHS isn't installed (non-Sunmi device), `initPaySDK` returns false or
 * `onConnectPaySDK` never fires. The activity treats that as "Sunmi
 * unavailable" and falls back to [StockNfcReader].
 */
class SunmiCardReader(
    private val activity: Activity,
    private val onReady: () -> Unit,
) : CardReader {

    private val payKernel: SunmiPayKernel = SunmiPayKernel.getInstance()
    private val main = Handler(Looper.getMainLooper())

    @Volatile private var readCardOpt: ReadCardOptV2? = null
    @Volatile private var pendingOnTap: (() -> Unit)? = null
    private var checkCardCallback: CheckCardCallbackV2.Stub? = null

    override val displayName: String = "Sunmi Pay SDK"

    /** True once SPHS has bound and `mReadCardOptV2` is available. */
    val isConnected: Boolean get() = readCardOpt != null

    /** Bind to SPHS. Call once at activity onCreate. */
    fun init(): Boolean {
        return try {
            payKernel.initPaySDK(activity, object : SunmiPayKernel.ConnectCallback {
                override fun onConnectPaySDK() {
                    Log.i(TAG, "onConnectPaySDK")
                    readCardOpt = payKernel.mReadCardOptV2
                    // If the activity asked for a tap before we were
                    // connected, start the check now.
                    pendingOnTap?.let { startInternal(it) }
                    main.post { onReady() }
                }

                override fun onDisconnectPaySDK() {
                    Log.w(TAG, "onDisconnectPaySDK")
                    readCardOpt = null
                }
            })
        } catch (t: Throwable) {
            Log.w(TAG, "initPaySDK threw: ${t.message}")
            false
        }
    }

    override fun start(onTagDetected: () -> Unit) {
        // Buffer the callback if SPHS hasn't bound yet — the connect callback
        // above will pick this up and start the check.
        pendingOnTap = onTagDetected
        if (readCardOpt != null) startInternal(onTagDetected)
    }

    private fun startInternal(onTagDetected: () -> Unit) {
        val opt = readCardOpt ?: return
        val cb = object : CheckCardCallbackV2.Stub() {
            // Contactless card detected — the demo's "approve" trigger.
            override fun findRFCard(uuid: String?) {
                Log.i(TAG, "findRFCard uuid=$uuid")
                main.post(onTagDetected)
            }
            override fun findRFCardEx(info: Bundle?) {
                Log.i(TAG, "findRFCardEx")
                main.post(onTagDetected)
            }

            // We don't care about magstripe or contact IC for this demo —
            // log and ignore. They could trigger approve too if a customer
            // inserts a chip card on a hybrid Sunmi reader.
            override fun findMagCard(info: Bundle?) {
                Log.i(TAG, "findMagCard (ignored)")
            }
            override fun findICCard(atr: String?) {
                Log.i(TAG, "findICCard (ignored)")
            }
            override fun findICCardEx(info: Bundle?) {
                Log.i(TAG, "findICCardEx (ignored)")
            }

            override fun onError(code: Int, message: String?) {
                Log.w(TAG, "checkCard onError code=$code msg=$message")
            }
            override fun onErrorEx(info: Bundle?) {
                Log.w(TAG, "checkCard onErrorEx info=$info")
            }
        }
        checkCardCallback = cb
        try {
            // 60s timeout matches the server-side payment-intent expiry —
            // if the customer doesn't tap in that window the server will
            // have already auto-declined and the activity will call stop().
            opt.checkCard(AidlConstants.CardType.NFC.value, cb, /* timeout */ 60)
            Log.i(TAG, "checkCard(NFC) started")
        } catch (e: RemoteException) {
            Log.w(TAG, "checkCard failed: ${e.message}")
        }
    }

    override fun stop() {
        pendingOnTap = null
        val opt = readCardOpt ?: return
        try {
            opt.cancelCheckCard()
            opt.cardOff(AidlConstants.CardType.NFC.value)
            Log.i(TAG, "stop()")
        } catch (e: RemoteException) {
            Log.w(TAG, "stop failed: ${e.message}")
        }
        checkCardCallback = null
    }

    override fun shutdown() {
        stop()
        try {
            payKernel.destroyPaySDK()
        } catch (t: Throwable) {
            Log.w(TAG, "destroyPaySDK threw: ${t.message}")
        }
        readCardOpt = null
    }

    companion object {
        private const val TAG = "SunmiCardReader"
    }
}
