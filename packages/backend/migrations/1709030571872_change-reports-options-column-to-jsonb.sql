-- Up Migration

ALTER TABLE reports ALTER COLUMN options TYPE JSONB;

-- Down Migration

ALTER TABLE reports ALTER COLUMN options TYPE JSON;
