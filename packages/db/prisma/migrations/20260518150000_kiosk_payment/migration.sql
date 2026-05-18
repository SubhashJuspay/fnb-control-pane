-- Kiosk POS terminal payment flow. Adds an explicit payment-mode column so
-- the resolver can branch on "must be paid via POS terminal first" without
-- conflating it with the staff-confirm flow.
--
-- Existing rows: every pre-existing online order was pay-at-pickup, so the
-- default + NOT NULL satisfies the historical data. paymentStatus stays
-- nullable because PAY_AT_PICKUP orders have no payment-state machine.

CREATE TYPE "OnlineOrderPaymentMode" AS ENUM ('PAY_AT_PICKUP', 'PAY_AT_KIOSK');
CREATE TYPE "OnlineOrderPaymentStatus" AS ENUM ('PENDING', 'CAPTURED', 'DECLINED');

ALTER TABLE "online_order_requests"
  ADD COLUMN "payment_mode" "OnlineOrderPaymentMode" NOT NULL DEFAULT 'PAY_AT_PICKUP',
  ADD COLUMN "payment_status" "OnlineOrderPaymentStatus";
