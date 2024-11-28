-- Up Migration

ALTER TABLE jobs ADD COLUMN progress REAL CHECK (progress BETWEEN 0 AND 1);

-- Down Migration

ALTER TABLE jobs DROP COLUMN progress;
