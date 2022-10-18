-- Up Migration

ALTER TABLE debt ADD COLUMN last_reminded TIMESTAMPTZ;

-- Down Migration

ALTER TABLE debt DROP COLUMN last_reminded;
