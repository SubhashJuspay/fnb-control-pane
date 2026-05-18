package com.fnb.posterminal.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.text.KeyboardOptions
import com.fnb.posterminal.state.TerminalSettings

/**
 * First-launch + "edit settings" screen. Three fields, one button. No
 * validation beyond non-empty — the WS handshake on the server will surface
 * bad slugs as a connection-failure on the idle screen.
 */
@Composable
fun SettingsScreen(
    initial: TerminalSettings,
    onSave: (TerminalSettings) -> Unit,
) {
    var baseUrl by remember(initial) {
        mutableStateOf(TextFieldValue(initial.baseUrl))
    }
    var tenant by remember(initial) {
        mutableStateOf(TextFieldValue(initial.tenantSlug))
    }
    var location by remember(initial) {
        mutableStateOf(TextFieldValue(initial.locationSlug))
    }
    val canSave =
        baseUrl.text.isNotBlank() && tenant.text.isNotBlank() && location.text.isNotBlank()

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(PaddingValues(horizontal = 48.dp, vertical = 32.dp)),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(
                "Pair this terminal",
                style = MaterialTheme.typography.headlineLarge,
                color = MaterialTheme.colorScheme.onBackground,
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Point the device at the API and the location it serves.",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(24.dp))

            OutlinedTextField(
                value = baseUrl,
                onValueChange = { baseUrl = it },
                label = { Text("Server URL") },
                placeholder = { Text("https://fnb-api.onrender.com") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp),
            )
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = tenant,
                onValueChange = { tenant = it },
                label = { Text("Tenant slug") },
                placeholder = { Text("acme") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp),
            )
            Spacer(Modifier.height(16.dp))
            OutlinedTextField(
                value = location,
                onValueChange = { location = it },
                label = { Text("Location slug") },
                placeholder = { Text("mission-st") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp),
            )
            Spacer(Modifier.height(28.dp))
            Button(
                onClick = {
                    onSave(
                        TerminalSettings(
                            baseUrl = baseUrl.text,
                            tenantSlug = tenant.text,
                            locationSlug = location.text,
                        ),
                    )
                },
                enabled = canSave,
                modifier = Modifier.widthIn(min = 200.dp),
            ) {
                Text("Connect", style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}
