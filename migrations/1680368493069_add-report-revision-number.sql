-- Up Migration

ALTER TABLE reports ADD COLUMN revision INT NOT NULL DEFAULT 1;

-- Down Migration

ALTER TABLE reports DROP COLUMN revision;
