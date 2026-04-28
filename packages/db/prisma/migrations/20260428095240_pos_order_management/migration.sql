-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'CLOSED', 'VOIDED');

-- CreateEnum
CREATE TYPE "TicketItemStatus" AS ENUM ('NEW', 'FIRED', 'READY', 'SERVED', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEOUT');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('FLAT', 'PERCENT');

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "short_number" INTEGER NOT NULL,
    "business_day" DATE NOT NULL,
    "customer_label" TEXT,
    "order_type" "OrderType" NOT NULL DEFAULT 'DINE_IN',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "opened_by_id" UUID NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_by_id" UUID,
    "closed_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "close_note" TEXT,
    "subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "discount_cents" INTEGER NOT NULL DEFAULT 0,
    "tax_cents" INTEGER NOT NULL DEFAULT 0,
    "total_cents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "status" "TicketItemStatus" NOT NULL DEFAULT 'NEW',
    "name_snapshot" TEXT NOT NULL,
    "unit_price_cents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "modifiers_total_cents" INTEGER NOT NULL DEFAULT 0,
    "line_subtotal_cents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "course" "ItemCourse" NOT NULL,
    "fired_by_id" UUID,
    "fired_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "served_by_id" UUID,
    "served_at" TIMESTAMP(3),
    "voided_by_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_item_modifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_item_id" UUID NOT NULL,
    "modifier_id" UUID NOT NULL,
    "name_snapshot" TEXT NOT NULL,
    "price_delta_cents" INTEGER NOT NULL,
    "modifier_group_name" TEXT NOT NULL,

    CONSTRAINT "ticket_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "ticket_id" UUID,
    "ticket_item_id" UUID,
    "kind" "DiscountKind" NOT NULL,
    "amount_cents" INTEGER,
    "percent_bp" INTEGER,
    "computed_cents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "applied_by_id" UUID NOT NULL,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided_by_id" UUID,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tickets_location_id_status_idx" ON "tickets"("location_id", "status");

-- CreateIndex
CREATE INDEX "tickets_location_id_opened_at_idx" ON "tickets"("location_id", "opened_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_location_id_business_day_short_number_key" ON "tickets"("location_id", "business_day", "short_number");

-- CreateIndex
CREATE INDEX "ticket_items_ticket_id_idx" ON "ticket_items"("ticket_id");

-- CreateIndex
CREATE INDEX "ticket_items_ticket_id_status_idx" ON "ticket_items"("ticket_id", "status");

-- CreateIndex
CREATE INDEX "ticket_item_modifiers_ticket_item_id_idx" ON "ticket_item_modifiers"("ticket_item_id");

-- CreateIndex
CREATE INDEX "discounts_ticket_id_idx" ON "discounts"("ticket_id");

-- CreateIndex
CREATE INDEX "discounts_ticket_item_id_idx" ON "discounts"("ticket_item_id");

-- CreateIndex
CREATE INDEX "discounts_location_id_applied_at_idx" ON "discounts"("location_id", "applied_at");

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_opened_by_id_fkey" FOREIGN KEY ("opened_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_closed_by_id_fkey" FOREIGN KEY ("closed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_fired_by_id_fkey" FOREIGN KEY ("fired_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_served_by_id_fkey" FOREIGN KEY ("served_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_item_modifiers" ADD CONSTRAINT "ticket_item_modifiers_ticket_item_id_fkey" FOREIGN KEY ("ticket_item_id") REFERENCES "ticket_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_item_modifiers" ADD CONSTRAINT "ticket_item_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_ticket_item_id_fkey" FOREIGN KEY ("ticket_item_id") REFERENCES "ticket_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_applied_by_id_fkey" FOREIGN KEY ("applied_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_voided_by_id_fkey" FOREIGN KEY ("voided_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "discounts"
  ADD CONSTRAINT "discounts_scope_xor"
  CHECK ((ticket_id IS NULL) <> (ticket_item_id IS NULL));
