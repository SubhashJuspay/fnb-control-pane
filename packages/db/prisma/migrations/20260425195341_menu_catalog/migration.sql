-- CreateEnum
CREATE TYPE "TaxCategoryKind" AS ENUM ('FOOD', 'NON_ALCOHOL_BEV', 'ALCOHOL', 'RETAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "ItemCourse" AS ENUM ('APPETIZER', 'MAIN', 'DESSERT', 'SIDE', 'BEVERAGE', 'OTHER');

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "TaxCategoryKind" NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_rates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tax_category_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "rate_permille" INTEGER NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_until" TIMESTAMP(3),

    CONSTRAINT "tax_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "category_id" UUID,
    "tax_category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "short_description" TEXT,
    "description" TEXT,
    "base_price_cents" INTEGER NOT NULL,
    "image_url" TEXT,
    "course" "ItemCourse" NOT NULL DEFAULT 'MAIN',
    "printer_station" TEXT,
    "dietary_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergen_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "min_selections" INTEGER NOT NULL DEFAULT 0,
    "max_selections" INTEGER NOT NULL DEFAULT 1,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modifier_group_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "price_delta_cents" INTEGER NOT NULL DEFAULT 0,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_modifier_groups" (
    "menu_item_id" UUID NOT NULL,
    "modifier_group_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "menu_item_modifier_groups_pkey" PRIMARY KEY ("menu_item_id","modifier_group_id")
);

-- CreateTable
CREATE TABLE "menus" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "schedule" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_sections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "menu_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_section_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "menu_section_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "price_override_cents" INTEGER,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "menu_section_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "priceCents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location_modifiers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "location_id" UUID NOT NULL,
    "modifier_id" UUID NOT NULL,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "price_delta_override_cents" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_tenant_id_idx" ON "categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenant_id_slug_key" ON "categories"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "tax_categories_tenant_id_kind_key" ON "tax_categories"("tenant_id", "kind");

-- CreateIndex
CREATE INDEX "tax_rates_tax_category_id_location_id_effective_from_idx" ON "tax_rates"("tax_category_id", "location_id", "effective_from");

-- CreateIndex
CREATE INDEX "menu_items_tenant_id_archived_at_idx" ON "menu_items"("tenant_id", "archived_at");

-- CreateIndex
CREATE INDEX "menu_items_tenant_id_category_id_idx" ON "menu_items"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "modifier_groups_tenant_id_idx" ON "modifier_groups"("tenant_id");

-- CreateIndex
CREATE INDEX "modifiers_modifier_group_id_idx" ON "modifiers"("modifier_group_id");

-- CreateIndex
CREATE INDEX "menus_location_id_archived_at_idx" ON "menus"("location_id", "archived_at");

-- CreateIndex
CREATE INDEX "menu_sections_menu_id_idx" ON "menu_sections"("menu_id");

-- CreateIndex
CREATE INDEX "menu_section_items_menu_item_id_idx" ON "menu_section_items"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_section_items_menu_section_id_menu_item_id_key" ON "menu_section_items"("menu_section_id", "menu_item_id");

-- CreateIndex
CREATE INDEX "location_items_location_id_idx" ON "location_items"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_items_location_id_menu_item_id_key" ON "location_items"("location_id", "menu_item_id");

-- CreateIndex
CREATE INDEX "location_modifiers_location_id_idx" ON "location_modifiers"("location_id");

-- CreateIndex
CREATE UNIQUE INDEX "location_modifiers_location_id_modifier_id_key" ON "location_modifiers"("location_id", "modifier_id");

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_categories" ADD CONSTRAINT "tax_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_rates" ADD CONSTRAINT "tax_rates_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_tax_category_id_fkey" FOREIGN KEY ("tax_category_id") REFERENCES "tax_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_modifier_groups" ADD CONSTRAINT "menu_item_modifier_groups_modifier_group_id_fkey" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menus" ADD CONSTRAINT "menus_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_sections" ADD CONSTRAINT "menu_sections_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_section_items" ADD CONSTRAINT "menu_section_items_menu_section_id_fkey" FOREIGN KEY ("menu_section_id") REFERENCES "menu_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_section_items" ADD CONSTRAINT "menu_section_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_items" ADD CONSTRAINT "location_items_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_items" ADD CONSTRAINT "location_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_modifiers" ADD CONSTRAINT "location_modifiers_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location_modifiers" ADD CONSTRAINT "location_modifiers_modifier_id_fkey" FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
