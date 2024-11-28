-- Up Migration

ALTER TABLE jobs ADD COLUMN triggered_by UUID REFERENCES payer_profiles (id);

-- Down Migration

ALTER TABLE jobs DROP COLUMN triggered_by;
