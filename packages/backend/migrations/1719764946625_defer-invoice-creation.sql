-- Up Migration

ALTER TABLE debt ADD COLUMN payment_options JSONB;

-- Down Migration

ALTER TABLE debt DROP COLUMN payment_options;
