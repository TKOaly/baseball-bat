-- Up Migration

ALTER TABLE debt_tags DROP CONSTRAINT fk_debt_id;
ALTER TABLE debt_tags ADD CONSTRAINT fk_debt_id FOREIGN KEY (debt_id) REFERENCES debt (id) ON DELETE CASCADE;

-- Down Migration

ALTER TABLE debt_tags DROP CONSTRAINT fk_debt_id;
ALTER TABLE debt_tags ADD CONSTRAINT fk_debt_id FOREIGN KEY (debt_id) REFERENCES debt (id);
