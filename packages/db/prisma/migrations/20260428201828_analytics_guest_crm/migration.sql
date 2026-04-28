-- AlterTable
ALTER TABLE "reservations" ADD COLUMN     "guest_id" UUID;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "guest_id" UUID;

-- CreateTable
CREATE TABLE "guests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guests_tenant_id_name_idx" ON "guests"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "guests_tenant_id_phone_idx" ON "guests"("tenant_id", "phone");

-- CreateIndex
CREATE INDEX "guests_tenant_id_archived_at_idx" ON "guests"("tenant_id", "archived_at");

-- CreateIndex
CREATE INDEX "reservations_location_id_guest_id_idx" ON "reservations"("location_id", "guest_id");

-- CreateIndex
CREATE INDEX "tickets_location_id_closed_at_idx" ON "tickets"("location_id", "closed_at");

-- CreateIndex
CREATE INDEX "tickets_location_id_guest_id_idx" ON "tickets"("location_id", "guest_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_id_fkey" FOREIGN KEY ("guest_id") REFERENCES "guests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guests" ADD CONSTRAINT "guests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
