package com.fnb.posterminal.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.fnb.posterminal.ws.ConnectionState

/**
 * Idle screen — what the customer-facing terminal shows when no payment is
 * pending. Top bar with the paired location + settings cog, a pulsing
 * contactless graphic in the middle, and a connection-status bar pinned to
 * the bottom. Visually mirrors the "ready" state on a Stripe Terminal / Square.
 */
@Composable
fun IdleScreen(
    connection: ConnectionState,
    onEditSettings: () -> Unit,
) {
    val locationLabel = when (connection) {
        is ConnectionState.Connected -> "${connection.tenantName} · ${connection.locationName}"
        is ConnectionState.Connecting -> "Connecting…"
        is ConnectionState.Disconnected -> "Not connected"
    }

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(verticalBackdrop()),
        ) {
            Column(modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
                TopBar(label = locationLabel, onEditSettings = onEditSettings)
                Column(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    verticalArrangement = Arrangement.Center,
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    PulsingTapHero()
                    Spacer(Modifier.height(40.dp))
                    Text(
                        "Ready to accept payments",
                        style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
                        color = MaterialTheme.colorScheme.onBackground,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Waiting for the kiosk to start a payment.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(28.dp))
                    SupportedMethodsRow()
                    Spacer(Modifier.height(20.dp))
                    SecurityBadge()
                }
                ConnectionStatusBar(connection)
            }
        }
    }
}

@Composable
private fun TopBar(label: String, onEditSettings: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.CreditCard,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(22.dp),
        )
        Spacer(Modifier.width(10.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onEditSettings) {
            Icon(
                imageVector = Icons.Outlined.Settings,
                contentDescription = "Settings",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
private fun PulsingTapHero() {
    val transition = rememberInfiniteTransition(label = "idle-pulse")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "pulse",
    )

    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(260.dp)) {
        // Three rings, phase-shifted, evoke the contactless radar that Stripe
        // / Square use to telegraph "tap to pay here".
        IdlePulseRing(progress = pulse, baseSize = 80.dp, maxBoost = 160.dp)
        IdlePulseRing(progress = (pulse + 0.33f) % 1f, baseSize = 80.dp, maxBoost = 160.dp)
        IdlePulseRing(progress = (pulse + 0.66f) % 1f, baseSize = 80.dp, maxBoost = 160.dp)
        Box(
            modifier = Modifier
                .size(140.dp)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            MaterialTheme.colorScheme.primary,
                            MaterialTheme.colorScheme.primaryContainer,
                        ),
                    ),
                ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Filled.Nfc,
                contentDescription = null,
                modifier = Modifier.size(64.dp),
                tint = MaterialTheme.colorScheme.onPrimary,
            )
        }
    }
}

@Composable
private fun IdlePulseRing(progress: Float, baseSize: Dp, maxBoost: Dp) {
    val size = baseSize + (maxBoost * progress)
    Box(
        modifier = Modifier
            .size(size)
            .alpha((1f - progress) * 0.35f)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
    )
}

@Composable
private fun SupportedMethodsRow() {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(28.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.6f))
            .padding(horizontal = 18.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        MethodBadge(label = "Chip", icon = Icons.Outlined.CreditCard)
        DotSeparator()
        MethodBadge(label = "Tap", icon = Icons.Filled.Nfc)
        DotSeparator()
        MethodBadge(label = "Swipe", icon = Icons.Outlined.CreditCard, dimmed = true)
    }
}

@Composable
private fun MethodBadge(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    dimmed: Boolean = false,
) {
    val tint = if (dimmed) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(6.dp))
        Text(label, style = MaterialTheme.typography.labelLarge, color = tint)
    }
}

@Composable
private fun DotSeparator() {
    Box(
        modifier = Modifier
            .size(4.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)),
    )
}

@Composable
private fun SecurityBadge() {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(
            imageVector = Icons.Outlined.Lock,
            contentDescription = null,
            tint = SuccessGreen,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(6.dp))
        Text(
            "Secure · Encrypted",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun ConnectionStatusBar(state: ConnectionState) {
    val (label, color, icon) = when (state) {
        is ConnectionState.Connected -> Triple(
            "Online · ${state.tenantName} · ${state.locationName}",
            SuccessGreen,
            Icons.Outlined.Wifi,
        )
        is ConnectionState.Connecting -> Triple(
            "Connecting…",
            MaterialTheme.colorScheme.primary,
            Icons.Outlined.Wifi,
        )
        is ConnectionState.Disconnected -> Triple(
            "Offline · ${state.reason}",
            DangerRed,
            Icons.Outlined.WifiOff,
        )
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(CircleShape)
                .background(color),
        )
        Spacer(Modifier.width(10.dp))
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = color,
            modifier = Modifier.size(16.dp),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
internal fun verticalBackdrop(): Brush {
    // Soft gradient pulls the eye toward the centre where the action is.
    return Brush.verticalGradient(
        colors = listOf(
            MaterialTheme.colorScheme.background,
            MaterialTheme.colorScheme.background,
            Color(0xFF1A2333),
        ),
    )
}
