-- Up Migration

ALTER TABLE reports ADD COLUMN options JSON;

-- Down Migration

ALTER TABLE DROP COLUMN options;
