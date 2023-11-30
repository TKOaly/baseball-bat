-- Up Migration

ALTER TABLE payer_profiles
ADD COLUMN merged_to UUID
CONSTRAINT fk_merged_from REFERENCES payer_profiles (id); 

ALTER TABLE payer_profiles
ADD COLUMN disabled BOOLEAN DEFAULT false;

-- Down Migration

ALTER TABLE payer_profiles DROP COLUMN merged_to CASCADE;
ALTER TABLE payer_profiles DROP COLUMN disabled;
