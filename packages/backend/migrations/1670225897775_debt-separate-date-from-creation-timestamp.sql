-- Up Migration

ALTER TABLE debt ADD COLUMN date DATE;
UPDATE debt SET date = published_at WHERE published_at IS NOT NULL AND date IS NULL; 
ALTER TABLE debt ADD CONSTRAINT date_required_if_published CHECK (published_at IS NULL OR date IS NOT NULL);

-- Down Migration

ALTER TABLE debt DROP CONSTRAINT date_required_if_published;
ALTER TABLE debt DROP COLUMN date;
