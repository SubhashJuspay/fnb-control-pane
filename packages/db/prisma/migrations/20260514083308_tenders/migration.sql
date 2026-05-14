-- CreateEnum
CREATE TYPE "TenderMethod" AS ENUM ('CASH', 'CARD', 'MOBILE', 'GIFT');

-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('AUTHORIZED', 'CAPTURED', 'DECLINED', 'VOIDED', 'REFUNDED');

-- CreateTable
CREATE TABLE "tenders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "method" "TenderMethod" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "tip_cents" INTEGER NOT NULL DEFAULT 0,
    "tendered_cents" INTEGER,
    "change_cents" INTEGER,
    "card_brand" TEXT,
    "card_last4" TEXT,
    "auth_code" TEXT,
    "status" "TenderStatus" NOT NULL DEFAULT 'CAPTURED',
    "decline_reason" TEXT,
    "cash_session_id" UUID,
    "refunds_tender_id" UUID,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenders_ticket_id_idx" ON "tenders"("ticket_id");

-- CreateIndex
CREATE INDEX "tenders_location_id_processed_at_idx" ON "tenders"("location_id", "processed_at");

-- CreateIndex
CREATE INDEX "tenders_cash_session_id_idx" ON "tenders"("cash_session_id");

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_cash_session_id_fkey" FOREIGN KEY ("cash_session_id") REFERENCES "cash_drawer_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_processed_by_id_fkey" FOREIGN KEY ("processed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_refunds_tender_id_fkey" FOREIGN KEY ("refunds_tender_id") REFERENCES "tenders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
