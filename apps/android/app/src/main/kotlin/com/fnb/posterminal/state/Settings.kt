package com.fnb.posterminal.state

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Persisted terminal config: the API base URL plus the tenant + location
 * slugs the device is paired to. Stored in DataStore-Preferences so a
 * cold-start reads them without an I/O round-trip on the main thread.
 *
 * No tokens — see `apps/api/src/pos-terminal/route.ts` for the demo's
 * auth posture.
 */
data class TerminalSettings(
    val baseUrl: String,
    val tenantSlug: String,
    val locationSlug: String,
) {
    fun isComplete(): Boolean =
        baseUrl.isNotBlank() && tenantSlug.isNotBlank() && locationSlug.isNotBlank()
}

private val Context.dataStore by preferencesDataStore(name = "terminal_settings")

private object Keys {
    val BASE_URL = stringPreferencesKey("base_url")
    val TENANT = stringPreferencesKey("tenant_slug")
    val LOCATION = stringPreferencesKey("location_slug")
}

class SettingsRepository(private val context: Context) {

    val settings: Flow<TerminalSettings> = context.dataStore.data.map { prefs: Preferences ->
        TerminalSettings(
            baseUrl = prefs[Keys.BASE_URL] ?: "",
            tenantSlug = prefs[Keys.TENANT] ?: "",
            locationSlug = prefs[Keys.LOCATION] ?: "",
        )
    }

    suspend fun save(value: TerminalSettings) {
        context.dataStore.edit { prefs ->
            prefs[Keys.BASE_URL] = value.baseUrl.trim()
            prefs[Keys.TENANT] = value.tenantSlug.trim()
            prefs[Keys.LOCATION] = value.locationSlug.trim()
        }
    }
}
