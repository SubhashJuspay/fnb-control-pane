-- CreateEnum
CREATE TYPE "OrderOriginChannel" AS ENUM ('IN_PERSON', 'ONLINE');

-- CreateEnum
CREATE TYPE "OnlinePickupKind" AS ENUM ('ASAP', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "OnlineOrderConfirmStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "system_user_id" UUID;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "origin_channel" "OrderOriginChannel" NOT NULL DEFAULT 'IN_PERSON';

-- CreateTable
CREATE TABLE "online_order_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "customer_name" TEXT NOT NULL,
    "customer_phone" TEXT NOT NULL,
    "customer_email" TEXT,
    "pickup_at" TIMESTAMP(3) NOT NULL,
    "pickup_kind" "OnlinePickupKind" NOT NULL,
    "notes" TEXT,
    "confirm_status" "OnlineOrderConfirmStatus" NOT NULL DEFAULT 'PENDING',
    "confirmed_at" TIMESTAMP(3),
    "confirmed_by_id" UUID,
    "rejected_at" TIMESTAMP(3),
    "rejected_by_id" UUID,
    "reject_reason" TEXT,
    "tracking_token_hash" TEXT NOT NULL,
    "submitted_from_ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "online_order_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "online_order_requests_ticket_id_key" ON "online_order_requests"("ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "online_order_requests_tracking_token_hash_key" ON "online_order_requests"("tracking_token_hash");

-- CreateIndex
CREATE INDEX "online_order_requests_location_id_confirm_status_idx" ON "online_order_requests"("location_id", "confirm_status");

-- CreateIndex
CREATE INDEX "online_order_requests_location_id_created_at_idx" ON "online_order_requests"("location_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_system_user_id_key" ON "tenants"("system_user_id");

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_system_user_id_fkey" FOREIGN KEY ("system_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_requests" ADD CONSTRAINT "online_order_requests_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_requests" ADD CONSTRAINT "online_order_requests_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_requests" ADD CONSTRAINT "online_order_requests_confirmed_by_id_fkey" FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "online_order_requests" ADD CONSTRAINT "online_order_requests_rejected_by_id_fkey" FOREIGN KEY ("rejected_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
