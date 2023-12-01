-- Up Migration

ALTER TABLE debt ADD COLUMN credited BOOLEAN DEFAULT false;
ALTER TABLE payments ADD COLUMN credited BOOLEAN DEFAULT false;

-- Down Migration

ALTER TABLE debt DROP COLUMN credited;
ALTER TABLE payments DROP COLUMN credited;
