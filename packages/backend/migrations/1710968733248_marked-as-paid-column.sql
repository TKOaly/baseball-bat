-- Up Migration

ALTER TABLE debt ADD COLUMN marked_as_paid TIMESTAMPTZ;

-- Down Migration

ALTER TABLE debt DROP COLUMN marked_as_paid;
