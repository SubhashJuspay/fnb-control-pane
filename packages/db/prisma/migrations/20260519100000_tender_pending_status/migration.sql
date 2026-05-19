-- Add PENDING to TenderStatus. The new value sits BEFORE 'AUTHORIZED' to
-- keep the lifecycle order (pending → authorized → captured) consistent
-- with how we render status pills client-side.
--
-- Postgres 12+ allows ADD VALUE inside a transaction as long as the new
-- value isn't *used* in the same transaction — which is the case here,
-- the next migration that writes a PENDING row runs later.

ALTER TYPE "TenderStatus" ADD VALUE 'PENDING' BEFORE 'AUTHORIZED';
