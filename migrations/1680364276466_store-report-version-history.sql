-- Up Migration

ALTER TABLE reports
ADD COLUMN superseded_by UUID
CONSTRAINT fk_superseded_by REFERENCES reports (id);

-- Down Migration

ALTER TABLE reports
DROP COLUMN superseded_by;
