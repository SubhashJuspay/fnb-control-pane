package com.fnb.posterminal.ws

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonNames
import kotlinx.serialization.ExperimentalSerializationApi

/**
 * Wire-format messages exchanged with the API server. Mirrors
 * `apps/api/src/pos-terminal/protocol.ts` exactly — keep both in sync.
 *
 * The server uses Zod's `discriminatedUnion` on `type`; kotlinx.serialization
 * lines up with that using `@JsonClassDiscriminator("type")` on the sealed
 * root and `@SerialName` on each variant.
 */

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface ServerMessage {

    @Serializable
    @kotlinx.serialization.SerialName("ready")
    data class Ready(
        val locationName: String,
        val tenantName: String,
    ) : ServerMessage

    @Serializable
    @kotlinx.serialization.SerialName("pong")
    object Pong : ServerMessage

    @Serializable
    @kotlinx.serialization.SerialName("payment_request")
    data class PaymentRequest(
        val intentId: String,
        val amountCents: Long,
        val currency: String,
        val shortNumber: Int,
        val customerName: String,
        val tableLabel: String?,
        val items: List<LineItem>,
    ) : ServerMessage

    @Serializable
    @kotlinx.serialization.SerialName("payment_cancel")
    data class PaymentCancel(
        val intentId: String,
        val reason: String,
    ) : ServerMessage
}

@Serializable
data class LineItem(
    val name: String,
    val qty: Int,
    val lineTotalCents: Long,
    val modifiers: List<String> = emptyList(),
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface ClientMessage {

    @Serializable
    @kotlinx.serialization.SerialName("payment_result")
    data class PaymentResult(
        val intentId: String,
        val status: PaymentResultStatus,
    ) : ClientMessage

    @Serializable
    @kotlinx.serialization.SerialName("ping")
    object Ping : ClientMessage
}

@Serializable
enum class PaymentResultStatus {
    APPROVED,
    DECLINED,
    CANCELLED,
}
