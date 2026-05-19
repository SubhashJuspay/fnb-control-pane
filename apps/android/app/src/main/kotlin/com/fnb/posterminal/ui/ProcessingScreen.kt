package com.fnb.posterminal.ui

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.fnb.posterminal.state.ProcessingState
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

/**
 * Transient screen shown for ~1.5s between "card detected" and the final
 * result. A real terminal doesn't pop the approved screen the instant the
 * antenna sees the card; there is authorisation latency. We mirror that
 * here so the cashier sees the device acknowledge the tap before the
 * result lands.
 */
@Composable
fun ProcessingScreen(state: ProcessingState) {
    Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(verticalBackdrop()),
            contentAlignment = Alignment.Center,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                ProcessingDisc()
                Spacer(Modifier.height(28.dp))
                Text(
                    "Processing payment",
                    style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                    color = MaterialTheme.colorScheme.onBackground,
                    textAlign = TextAlign.Center,
                )
                Spacer(Modifier.height(6.dp))
                AnimatedDots()
                Spacer(Modifier.height(28.dp))

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Text(
                        "ORDER #${state.shortNumber}",
                        style = MaterialTheme.typography.labelMedium.copy(
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 1.5.sp,
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        formatMoney(state.amountCents, state.currency),
                        style = bigAmountStyle(),
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }

                Spacer(Modifier.height(16.dp))
                Text(
                    "Do not remove your card",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun ProcessingDisc() {
    Box(contentAlignment = Alignment.Center, modifier = Modifier.size(160.dp)) {
        Box(
            modifier = Modifier
                .size(160.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.10f)),
        )
        Box(
            modifier = Modifier
                .size(124.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.20f)),
        )
        CircularProgressIndicator(
            modifier = Modifier.size(96.dp),
            strokeWidth = 6.dp,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun AnimatedDots() {
    val transition = rememberInfiniteTransition(label = "processing-dots")
    val progress by transition.animateFloat(
        initialValue = 0f,
        targetValue = 3f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 900, easing = LinearEasing),
            repeatMode = RepeatMode.Restart,
        ),
        label = "dots",
    )
    Box(modifier = Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        androidx.compose.foundation.layout.Row(
            verticalAlignment = Alignment.CenterVertically,
        ) {
            for (i in 0 until 3) {
                val dotAlpha = if (progress > i) 1f else 0.25f
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .alpha(dotAlpha)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.onSurfaceVariant),
                )
                if (i < 2) Spacer(Modifier.size(6.dp))
            }
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
