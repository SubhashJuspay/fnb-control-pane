-- CreateEnum
CREATE TYPE "TableShape" AS ENUM ('RECT', 'CIRCLE');

-- CreateEnum
CREATE TYPE "TableManualState" AS ENUM ('NONE', 'CLEANING');

-- CreateEnum
CREATE TYPE "ReservationKind" AS ENUM ('RESERVATION', 'WALKIN');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITING', 'SEATED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "table_id" UUID;

-- CreateTable
CREATE TABLE "sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "section_id" UUID,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "shape" "TableShape" NOT NULL DEFAULT 'RECT',
    "position_x" INTEGER NOT NULL,
    "position_y" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 80,
    "height" INTEGER NOT NULL DEFAULT 80,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "manual_state" "TableManualState" NOT NULL DEFAULT 'NONE',
    "assigned_server_id" UUID,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "kind" "ReservationKind" NOT NULL DEFAULT 'RESERVATION',
    "status" "ReservationStatus" NOT NULL DEFAULT 'PENDING',
    "guest_name" TEXT NOT NULL,
    "guest_phone" TEXT,
    "party_size" INTEGER NOT NULL,
    "notes" TEXT,
    "requested_time" TIMESTAMP(3),
    "duration_minutes" INTEGER NOT NULL DEFAULT 90,
    "table_id" UUID,
    "ticket_id" UUID,
    "seated_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "no_show_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sections_location_id_archived_at_idx" ON "sections"("location_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "sections_location_id_name_key" ON "sections"("location_id", "name");

-- CreateIndex
CREATE INDEX "tables_location_id_section_id_idx" ON "tables"("location_id", "section_id");

-- CreateIndex
CREATE INDEX "tables_location_id_archived_at_idx" ON "tables"("location_id", "archived_at");

-- CreateIndex
CREATE UNIQUE INDEX "tables_location_id_label_key" ON "tables"("location_id", "label");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_ticket_id_key" ON "reservations"("ticket_id");

-- CreateIndex
CREATE INDEX "reservations_location_id_status_idx" ON "reservations"("location_id", "status");

-- CreateIndex
CREATE INDEX "reservations_location_id_requested_time_idx" ON "reservations"("location_id", "requested_time");

-- CreateIndex
CREATE INDEX "reservations_table_id_idx" ON "reservations"("table_id");

-- CreateIndex
CREATE INDEX "tickets_location_id_table_id_idx" ON "tickets"("location_id", "table_id");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections" ADD CONSTRAINT "sections_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "sections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_assigned_server_id_fkey" FOREIGN KEY ("assigned_server_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_fkey" FOREIGN KEY ("table_id") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraint: RESERVATION must have requested_time, WALKIN must not.
ALTER TABLE "reservations"
  ADD CONSTRAINT "reservations_kind_time"
  CHECK (
    (kind = 'RESERVATION' AND requested_time IS NOT NULL)
    OR (kind = 'WALKIN' AND requested_time IS NULL)
  );
