package com.fnb.posterminal

import android.os.Bundle
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
import com.fnb.posterminal.state.SettingsRepository
import com.fnb.posterminal.state.TerminalViewModel
import com.fnb.posterminal.ui.IdleScreen
import com.fnb.posterminal.ui.PaymentScreen
import com.fnb.posterminal.ui.PosTerminalTheme
import com.fnb.posterminal.ui.SettingsScreen

/**
 * Single activity, full-screen, sensor-landscape. The activity owns the
 * `TerminalViewModel` which in turn owns the WebSocket — both survive
 * config changes (orientation, dark/light, …).
 */
class MainActivity : ComponentActivity() {

    private val viewModel: TerminalViewModel by viewModels {
        TerminalViewModel.Factory(SettingsRepository(applicationContext))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Kiosk-style: keep the screen on while the activity is foregrounded.
        // A real production build would use a foreground service instead so
        // the WebSocket survives the device dimming/sleeping.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContent {
            PosTerminalTheme {
                Root(viewModel = viewModel)
            }
        }
    }
}

@Composable
private fun Root(viewModel: TerminalViewModel) {
    val settings by viewModel.settings.collectAsState()
    val connection by viewModel.connection.collectAsState()
    val activePayment by viewModel.activePayment.collectAsState()

    // The user can force-open the settings screen from the idle screen even
    // when settings are already saved — we toggle a local bit for that.
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
            onApprove = { viewModel.approve() },
            onDecline = { viewModel.decline() },
            onCancel = { viewModel.cancel() },
        )
        else -> IdleScreen(
            connection = connection,
            onEditSettings = { editingSettings = true },
        )
    }
}
