-- Up Migration

CREATE UNIQUE INDEX reports_human_id_rev_key ON reports (human_id, revision);
ALTER TABLE reports DROP CONSTRAINT reports_human_id_key;

-- Down Migration

CREATE UNIQUE INDEX reports_human_id_key ON reports (human_id);
ALTER TABLE reports DROP CONSTRAINT reports_human_id_rev_key;
