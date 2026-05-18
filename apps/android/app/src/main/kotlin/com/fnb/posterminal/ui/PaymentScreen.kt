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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Nfc
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fnb.posterminal.ws.LineItem
import com.fnb.posterminal.ws.ServerMessage
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Active-payment screen. Single-column portrait layout that mirrors a real
 * card-terminal flow: order header at top, hero amount + tap-prompt in the
 * middle, itemised summary, then actions pinned at the bottom.
 *
 * Approval paths:
 *   - NFC available (most phones, modern POS units): the activity arms
 *     `NfcAdapter` reader mode and any card tap calls `viewModel.approve()`.
 *     The screen invites a tap.
 *   - NFC unavailable (generic tablets, vendor-locked POS chips like Sunmi):
 *     a "Simulate card tap" button stays on screen as a manual fallback
 *     until vendor-SDK NFC integration replaces it.
 *
 * Decline + Cancel remain available regardless.
 */
@Composable
fun PaymentScreen(
    payment: ServerMessage.PaymentRequest,
    nfcAvailable: Boolean,
    onApprove: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(verticalBackdrop()),
        ) {
            Column(modifier = Modifier.fillMaxSize().windowInsetsPadding(WindowInsets.statusBars)) {
                OrderHeader(
                    shortNumber = payment.shortNumber,
                    customerName = payment.customerName,
                    tableLabel = payment.tableLabel,
                )
                AmountHero(
                    amount = formatMoney(payment.amountCents, payment.currency),
                    nfcAvailable = nfcAvailable,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(16.dp))
                OrderItemsCard(
                    payment = payment,
                    modifier = Modifier.fillMaxWidth().weight(1f).padding(horizontal = 16.dp),
                )
                Spacer(Modifier.height(12.dp))
                ActionRow(
                    nfcAvailable = nfcAvailable,
                    onApprove = onApprove,
                    onDecline = onDecline,
                    onCancel = onCancel,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                )
            }
        }
    }
}

@Composable
private fun OrderHeader(
    shortNumber: Int,
    customerName: String,
    tableLabel: String?,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(36.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Receipt,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.onPrimaryContainer,
                modifier = Modifier.size(20.dp),
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "Order #$shortNumber",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onBackground,
            )
            Text(
                buildString {
                    append(customerName)
                    if (!tableLabel.isNullOrBlank()) append(" · Table $tableLabel")
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        SecurePill()
    }
}

@Composable
private fun SecurePill() {
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(SuccessGreen.copy(alpha = 0.15f))
            .padding(horizontal = 10.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Outlined.Lock,
            contentDescription = null,
            tint = SuccessGreen,
            modifier = Modifier.size(12.dp),
        )
        Spacer(Modifier.width(4.dp))
        Text(
            "Secure",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = SuccessGreen,
        )
    }
}

@Composable
private fun AmountHero(
    amount: String,
    nfcAvailable: Boolean,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "TOTAL DUE",
            style = MaterialTheme.typography.labelMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 2.sp,
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(6.dp))
        Text(
            amount,
            style = bigMoneyStyle(),
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        TapPromptCard(nfcAvailable = nfcAvailable)
    }
}

@Composable
private fun TapPromptCard(nfcAvailable: Boolean) {
    val transition = rememberInfiniteTransition(label = "pay-pulse")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "pulse",
    )
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(vertical = 18.dp, horizontal = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(130.dp)) {
            PulseRing(progress = pulse, baseSize = 60.dp, boost = 70.dp)
            PulseRing(progress = (pulse + 0.33f) % 1f, baseSize = 60.dp, boost = 70.dp)
            PulseRing(progress = (pulse + 0.66f) % 1f, baseSize = 60.dp, boost = 70.dp)
            Box(
                modifier = Modifier
                    .size(90.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Nfc,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onPrimary,
                    modifier = Modifier.size(46.dp),
                )
            }
        }
        Spacer(Modifier.height(14.dp))
        Text(
            if (nfcAvailable) "Tap your card" else "Tap, insert, or swipe",
            style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            if (nfcAvailable) {
                "Hold a card or contactless phone to the back of the device"
            } else {
                "NFC not available on this device — use the approve button below"
            },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))
        MethodIcons()
        if (nfcAvailable) {
            Spacer(Modifier.height(12.dp))
            ReaderActivePill()
        }
    }
}

@Composable
private fun ReaderActivePill() {
    val transition = rememberInfiniteTransition(label = "reader-active")
    val opacity by transition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "opacity",
    )
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(SuccessGreen.copy(alpha = 0.12f))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .alpha(opacity)
                .clip(CircleShape)
                .background(SuccessGreen),
        )
        Spacer(Modifier.width(8.dp))
        Text(
            "Reader active · listening for a tap",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
            color = SuccessGreen,
        )
    }
}

@Composable
private fun PulseRing(progress: Float, baseSize: Dp, boost: Dp) {
    val size = baseSize + (boost * progress)
    Box(
        modifier = Modifier
            .size(size)
            .alpha((1f - progress) * 0.4f)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
    )
}

@Composable
private fun MethodIcons() {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        MethodIcon(icon = Icons.Filled.Nfc, label = "Contactless")
        Dot()
        MethodIcon(icon = Icons.Outlined.CreditCard, label = "Chip")
        Dot()
        MethodIcon(icon = Icons.Outlined.CreditCard, label = "Swipe", dimmed = true)
    }
}

@Composable
private fun MethodIcon(icon: ImageVector, label: String, dimmed: Boolean = false) {
    val tint = if (dimmed) {
        MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
    } else {
        MaterialTheme.colorScheme.primary
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(20.dp))
        Spacer(Modifier.height(2.dp))
        Text(label, style = MaterialTheme.typography.labelSmall, color = tint)
    }
}

@Composable
private fun Dot() {
    Box(
        modifier = Modifier
            .size(3.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f)),
    )
}

@Composable
private fun OrderItemsCard(
    payment: ServerMessage.PaymentRequest,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(horizontal = 18.dp, vertical = 16.dp),
    ) {
        Text(
            "ORDER DETAILS",
            style = MaterialTheme.typography.labelMedium.copy(
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(10.dp))
        LazyColumn(modifier = Modifier.weight(1f, fill = false)) {
            items(payment.items) { item ->
                LineRow(item, payment.currency)
                Spacer(Modifier.height(10.dp))
            }
        }
        Spacer(Modifier.height(4.dp))
        HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Total",
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                formatMoney(payment.amountCents, payment.currency),
                style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

/**
 * Bottom action row:
 *   - When NFC is supported, no primary button — the card-tap *is* the
 *     approve. Decline + Cancel ride as small text buttons.
 *   - When NFC is missing (Sunmi without vendor-SDK wiring, generic
 *     tablets), a primary "Simulate card tap" Approve button takes its
 *     place so the demo still works manually.
 */
@Composable
private fun ActionRow(
    nfcAvailable: Boolean,
    onApprove: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (nfcAvailable) {
        Row(
            modifier = modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally),
        ) {
            TextButton(onClick = onDecline) {
                Icon(Icons.Outlined.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Decline")
            }
            TextButton(onClick = onCancel) {
                Icon(Icons.Outlined.Cancel, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(Modifier.width(4.dp))
                Text("Cancel")
            }
        }
    } else {
        Column(modifier = modifier.fillMaxWidth()) {
            Button(
                onClick = onApprove,
                colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp),
            ) {
                Icon(Icons.Outlined.Check, contentDescription = null)
                Spacer(Modifier.width(10.dp))
                Text(
                    "Simulate card tap",
                    style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                )
            }
            Spacer(Modifier.height(8.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                TextButton(onClick = onDecline) { Text("Decline") }
                TextButton(onClick = onCancel) { Text("Cancel") }
            }
        }
    }
}

@Composable
private fun LineRow(item: LineItem, currency: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .size(26.dp)
                .clip(RoundedCornerShape(8.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                item.qty.toString(),
                style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        Spacer(Modifier.width(12.dp))
        Column(modifier = Modifier.weight(1f)) {
            Text(
                item.name,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (item.modifiers.isNotEmpty()) {
                Text(
                    item.modifiers.joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        Spacer(Modifier.width(12.dp))
        Text(
            formatMoney(item.lineTotalCents, currency),
            style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun bigMoneyStyle(): TextStyle = TextStyle(
    fontSize = 56.sp,
    fontWeight = FontWeight.ExtraBold,
    fontFamily = FontFamily.Default,
    letterSpacing = (-1).sp,
)

private fun formatMoney(amountCents: Long, currencyCode: String): String {
    val fmt = NumberFormat.getCurrencyInstance(Locale.US)
    runCatching { fmt.currency = Currency.getInstance(currencyCode) }
    return fmt.format(amountCents / 100.0)
}
