-- Up Migration

ALTER TABLE jobs ADD COLUMN lock_id SERIAL NOT NULL;

-- Down Migration

ALTER TABLE jobs DROP COLUMN lock_id;
