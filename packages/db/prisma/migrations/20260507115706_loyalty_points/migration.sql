-- AlterTable
ALTER TABLE "guests" ADD COLUMN     "points_balance" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "tickets" ADD COLUMN     "points_earned" INTEGER NOT NULL DEFAULT 0;
