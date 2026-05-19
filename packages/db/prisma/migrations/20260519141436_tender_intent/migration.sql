-- CreateEnum
CREATE TYPE "TenderIntent" AS ENUM ('CLOSE_TICKET', 'PREPAY_TICKET');

-- AlterTable
ALTER TABLE "tenders" ADD COLUMN     "intent" "TenderIntent" NOT NULL DEFAULT 'CLOSE_TICKET';
