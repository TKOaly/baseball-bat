-- Up Migration

CREATE TYPE report_status AS ENUM ('generating', 'finished', 'failed');

ALTER TABLE reports ADD COLUMN status report_status NOT NULL DEFAULT 'generating'::report_status;

UPDATE reports SET status = 'finished';

-- Down Migration

ALTER TABLE reports DROP COLUMN status;

DROP TYPE report_status;
