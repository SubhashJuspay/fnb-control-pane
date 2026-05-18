package com.fnb.posterminal.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

/**
 * Colour palette mirrors the web app's "Modern Tech Indigo" so the terminal
 * feels like it belongs next to the kiosk. We only carry the few tokens
 * Material3 needs — primary, surface, error, plus a success accent reused
 * for the "Approved" state.
 */
private val Indigo500 = Color(0xFF4F46E5)
private val Indigo400 = Color(0xFF818CF8)
private val Slate900 = Color(0xFF0F172A)
private val Slate800 = Color(0xFF1E293B)
private val Slate700 = Color(0xFF334155)
private val Slate200 = Color(0xFFE2E8F0)
private val Emerald500 = Color(0xFF10B981)
private val Rose500 = Color(0xFFE11D48)

internal val SuccessGreen = Emerald500
internal val DangerRed = Rose500

private val DarkColors = darkColorScheme(
    primary = Indigo400,
    onPrimary = Color.White,
    primaryContainer = Indigo500,
    onPrimaryContainer = Color.White,
    background = Slate900,
    onBackground = Slate200,
    surface = Slate800,
    onSurface = Slate200,
    surfaceVariant = Slate700,
    onSurfaceVariant = Color(0xFFCBD5E1),
    error = Rose500,
    onError = Color.White,
)

private val LightColors = lightColorScheme(
    primary = Indigo500,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE0E7FF),
    onPrimaryContainer = Indigo500,
    background = Color(0xFFF8FAFC),
    onBackground = Slate900,
    surface = Color.White,
    onSurface = Slate900,
    surfaceVariant = Slate200,
    onSurfaceVariant = Slate700,
    error = Rose500,
    onError = Color.White,
)

@Composable
fun PosTerminalTheme(content: @Composable () -> Unit) {
    // Terminal devices typically stay on dark mode in venue lighting; allow
    // system override anyway so dev work in light isn't blinding.
    val colors = if (isSystemInDarkTheme()) DarkColors else LightColors
    MaterialTheme(colorScheme = colors, content = content)
}
