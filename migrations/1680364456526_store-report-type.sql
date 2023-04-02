-- Up Migration

ALTER TABLE reports
ADD COLUMN type TEXT;

-- Down Migration

ALTER TABLE reports DROP COLUMN type;
