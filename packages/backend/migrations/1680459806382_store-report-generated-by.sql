-- Up Migration

ALTER TABLE reports
ADD COLUMN generated_by UUID
CONSTRAINT fk_generated_by REFERENCES payer_profiles (id);

-- Down Migration

ALTER TABLE reports
DROP COLUMN generated_by;
