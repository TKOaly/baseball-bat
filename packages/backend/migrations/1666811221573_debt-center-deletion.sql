-- Up Migration

ALTER TABLE debt_center ADD COLUMN deleted BOOLEAN DEFAULT FALSE NOT NULL;

-- Down Migration

ALTER TABLE debt_center DROP COLUMN deleted;
