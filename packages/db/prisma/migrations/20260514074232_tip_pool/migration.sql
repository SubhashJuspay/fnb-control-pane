-- CreateTable
CREATE TABLE "tip_pool_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "weights" JSONB NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tip_pool_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tip_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "location_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "business_day" DATE NOT NULL,
    "staff_member_id" UUID NOT NULL,
    "job_role_id" UUID,
    "amount_cents" INTEGER NOT NULL,
    "total_tip_pool_cents" INTEGER NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computed_by_id" UUID NOT NULL,

    CONSTRAINT "tip_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tip_pool_rules_tenant_id_location_id_idx" ON "tip_pool_rules"("tenant_id", "location_id");

-- CreateIndex
CREATE INDEX "tip_pool_rules_location_id_is_active_idx" ON "tip_pool_rules"("location_id", "is_active");

-- CreateIndex
CREATE INDEX "tip_allocations_location_id_business_day_idx" ON "tip_allocations"("location_id", "business_day");

-- CreateIndex
CREATE INDEX "tip_allocations_staff_member_id_business_day_idx" ON "tip_allocations"("staff_member_id", "business_day");

-- CreateIndex
CREATE UNIQUE INDEX "tip_allocations_rule_id_business_day_staff_member_id_key" ON "tip_allocations"("rule_id", "business_day", "staff_member_id");

-- AddForeignKey
ALTER TABLE "tip_pool_rules" ADD CONSTRAINT "tip_pool_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_pool_rules" ADD CONSTRAINT "tip_pool_rules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "tip_pool_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_staff_member_id_fkey" FOREIGN KEY ("staff_member_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_job_role_id_fkey" FOREIGN KEY ("job_role_id") REFERENCES "job_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tip_allocations" ADD CONSTRAINT "tip_allocations_computed_by_id_fkey" FOREIGN KEY ("computed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
