package com.fnb.posterminal.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Cancel
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.PrintDisabled
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fnb.posterminal.state.LastResult
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Post-payment confirmation. No auto-dismiss — the cashier explicitly taps
 * Done. That guarantees they see the printed-receipt status and can
 * reprint if the first print missed (out of paper, paper jam, etc).
 */
@Composable
fun ResultScreen(
    result: LastResult,
    printerAvailable: Boolean,
    onReprint: () -> Unit,
    onDismiss: () -> Unit,
) {
    // staff_ticket = cashier rang up the order and the kitchen already
    // has it; the customer is just paying at the counter. kiosk_order =
    // customer placed the order on the kiosk and items fire to the
    // kitchen only after capture. Old/missing kind = treat as kiosk
    // (older server build).
    val isStaffTicket = result.kind == "staff_ticket"
    val visuals = when (result) {
        is LastResult.Approved -> Visuals(
            headline = "Payment approved",
            subline = if (isStaffTicket) {
                "Receipt printed · thank you"
            } else {
                "Charge authorised — sending to kitchen"
            },
            icon = Icons.Outlined.Check,
            tint = SuccessGreen,
        )
        is LastResult.Declined -> Visuals(
            headline = "Card declined",
            subline = "Ask the customer to try a different card",
            icon = Icons.Outlined.Close,
            tint = DangerRed,
        )
        is LastResult.Cancelled -> Visuals(
            headline = "Payment cancelled",
            subline = "No charge made",
            icon = Icons.Outlined.Cancel,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    val isApproved = result is LastResult.Approved

    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(modifier = Modifier.fillMaxSize().background(verticalBackdrop())) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = 24.dp, vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Spacer(Modifier.height(24.dp))
                ResultDisc(icon = visuals.icon, tint = visuals.tint)
                Spacer(Modifier.height(20.dp))
                Text(
                    visuals.headline,
                    style = MaterialTheme.typography.displaySmall.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    visuals.subline,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(24.dp))

                // Amount + order # card.
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        "ORDER #${result.shortNumber}",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.5.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        formatMoney(result.amountCents, result.currency),
                        style = bigAmountStyle(),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                if (isApproved) {
                    Spacer(Modifier.height(16.dp))
                    ReceiptStatusPill(printerAvailable)
                }

                Spacer(Modifier.weight(1f))

                // Actions. Reprint only shown for approved + printer available.
                Column(modifier = Modifier.fillMaxWidth()) {
                    if (isApproved && printerAvailable) {
                        OutlinedButton(
                            onClick = onReprint,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.fillMaxWidth().heightIn(min = 54.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.Receipt,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp),
                            )
                            Spacer(Modifier.width(8.dp))
                            Text("Reprint receipt")
                        }
                        Spacer(Modifier.height(10.dp))
                    }
                    Button(
                        onClick = onDismiss,
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp),
                    ) {
                        Text(
                            "Done",
                            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ReceiptStatusPill(printerAvailable: Boolean) {
    val (icon, label, tint) = if (printerAvailable) {
        Triple(
            Icons.Outlined.Receipt,
            "Receipt printed",
            SuccessGreen,
        )
    } else {
        Triple(
            Icons.Outlined.PrintDisabled,
            "No printer detected — receipt skipped",
            MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(tint.copy(alpha = 0.12f))
            .padding(horizontal = 14.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(8.dp))
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = tint,
        )
    }
}

private data class Visuals(
    val headline: String,
    val subline: String,
    val icon: ImageVector,
    val tint: Color,
)

@Composable
private fun ResultDisc(icon: ImageVector, tint: Color) {
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(160.dp)) {
        Box(
            modifier = Modifier
                .size(160.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.10f)),
        )
        Box(
            modifier = Modifier
                .size(124.dp)
                .clip(CircleShape)
                .background(tint.copy(alpha = 0.20f)),
        )
        Box(
            modifier = Modifier
                .size(96.dp)
                .clip(CircleShape)
                .background(tint),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(56.dp),
            )
        }
    }
}

private fun bigAmountStyle(): TextStyle = TextStyle(
    fontSize = 44.sp,
    fontWeight = FontWeight.ExtraBold,
    fontFamily = FontFamily.Default,
    letterSpacing = (-1).sp,
)

private fun formatMoney(amountCents: Long, currencyCode: String): String {
    val fmt = NumberFormat.getCurrencyInstance(Locale.US)
    runCatching { fmt.currency = Currency.getInstance(currencyCode) }
    return fmt.format(amountCents / 100.0)
}
