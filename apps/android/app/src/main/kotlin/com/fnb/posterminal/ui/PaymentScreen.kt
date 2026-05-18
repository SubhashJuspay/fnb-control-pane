package com.fnb.posterminal.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Nfc
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.fnb.posterminal.ws.LineItem
import com.fnb.posterminal.ws.ServerMessage
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Active-payment screen. Two columns on a landscape kiosk:
 *
 *   Left  — pulsing card-reader graphic + "Insert, tap, swipe" prompt.
 *   Right — itemised order summary + Approve / Decline / Cancel buttons.
 *
 * The Approve button is the demo's "card read succeeded" — in real life
 * the device would replace this with NFC + EMV events.
 */
@Composable
fun PaymentScreen(
    payment: ServerMessage.PaymentRequest,
    onApprove: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Row(modifier = Modifier.fillMaxSize().padding(24.dp)) {
            ReadingCardPanel(
                amount = formatMoney(payment.amountCents, payment.currency),
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
            Spacer(Modifier.width(24.dp))
            OrderSummaryPanel(
                payment = payment,
                onApprove = onApprove,
                onDecline = onDecline,
                onCancel = onCancel,
                modifier = Modifier.weight(1f).fillMaxHeight(),
            )
        }
    }
}

@Composable
private fun ReadingCardPanel(
    amount: String,
    modifier: Modifier = Modifier,
) {
    val transition = rememberInfiniteTransition(label = "pulse")
    val pulse by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "pulse-alpha",
    )

    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.large)
            .background(MaterialTheme.colorScheme.surface)
            .padding(40.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(contentAlignment = Alignment.Center, modifier = Modifier.size(220.dp)) {
            // Two rings expanding outward to evoke the contactless-tap radar
            // animation customers recognise from Stripe / Square terminals.
            PulseRing(progress = pulse)
            PulseRing(progress = (pulse + 0.4f) % 1f)
            Icon(
                imageVector = Icons.Outlined.Nfc,
                contentDescription = null,
                modifier = Modifier.size(96.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(Modifier.height(28.dp))
        Text(
            amount,
            style = MaterialTheme.typography.displayLarge.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onBackground,
        )
        Spacer(Modifier.height(12.dp))
        Text(
            "Insert, tap, or swipe",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun PulseRing(progress: Float) {
    val size = 80.dp + (140.dp * progress)
    Box(
        modifier = Modifier
            .size(size)
            .alpha((1f - progress) * 0.6f)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primary),
    )
}

@Composable
private fun OrderSummaryPanel(
    payment: ServerMessage.PaymentRequest,
    onApprove: () -> Unit,
    onDecline: () -> Unit,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .clip(MaterialTheme.shapes.large)
            .background(MaterialTheme.colorScheme.surface)
            .padding(28.dp),
    ) {
        Text(
            "Order #${payment.shortNumber}",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (!payment.tableLabel.isNullOrBlank()) {
            Text(
                "Table ${payment.tableLabel}",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            payment.customerName,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(20.dp))
        LazyColumn(modifier = Modifier.weight(1f)) {
            items(payment.items) { item ->
                LineRow(item, payment.currency)
                Spacer(Modifier.height(12.dp))
            }
        }
        Spacer(Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                "Total",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                formatMoney(payment.amountCents, payment.currency),
                style = MaterialTheme.typography.displayMedium.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onApprove,
            colors = ButtonDefaults.buttonColors(containerColor = SuccessGreen),
            modifier = Modifier.fillMaxWidth().height(64.dp),
        ) {
            Icon(Icons.Outlined.Check, contentDescription = null)
            Spacer(Modifier.width(10.dp))
            Text("Approve", style = MaterialTheme.typography.titleLarge)
        }
        Spacer(Modifier.height(12.dp))
        Row(modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(
                onClick = onDecline,
                modifier = Modifier.weight(1f).height(56.dp),
            ) {
                Icon(Icons.Outlined.Close, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Decline")
            }
            Spacer(Modifier.width(12.dp))
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.weight(1f).height(56.dp),
            ) {
                Icon(Icons.Outlined.Cancel, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Cancel")
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
        Column(modifier = Modifier.weight(1f)) {
            Text(
                "${item.qty} × ${item.name}",
                style = MaterialTheme.typography.titleMedium,
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
        Text(
            formatMoney(item.lineTotalCents, currency),
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

private fun formatMoney(amountCents: Long, currencyCode: String): String {
    val fmt = NumberFormat.getCurrencyInstance(Locale.US)
    runCatching { fmt.currency = Currency.getInstance(currencyCode) }
    return fmt.format(amountCents / 100.0)
}
