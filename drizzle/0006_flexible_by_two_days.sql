-- Checkout now asks whether the dates could move by a day or two, and neither
-- of the existing values says that: PLUS_MINUS_1 is narrower than what the
-- customer agreed to, PLUS_MINUS_3 is wider than it. Added in place rather than
-- appended so the enum still reads in order of how far the dates can move.
ALTER TYPE "public"."date_flexibility" ADD VALUE 'PLUS_MINUS_2' BEFORE 'PLUS_MINUS_3';
