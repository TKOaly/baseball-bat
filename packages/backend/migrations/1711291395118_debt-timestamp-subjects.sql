-- Up Migration

ALTER TABLE debt
  ADD COLUMN published_by UUID REFERENCES payer_profiles (id),
  ADD COLUMN credited_by UUID REFERENCES payer_profiles (id),
  ADD COLUMN credited_at TIMESTAMPTZ,
  ADD CONSTRAINT published_no_subject_without_timestamp CHECK (published_by IS NULL OR published_at IS NOT NULL),
  ADD CONSTRAINT credited_no_subject_without_timestamp CHECK (credited_by IS NULL OR credited_at IS NOT NULL);

UPDATE debt SET credited_at = NOW() WHERE credited AND credited_at IS NULL;

ALTER TABLE debt DROP column credited CASCADE;
ALTER TABLE debt ADD COLUMN credited BOOL GENERATED ALWAYS AS (credited_at IS NOT NULL) STORED;

CREATE VIEW debt_statuses AS (
  SELECT d.*, bool_or(ps.status = 'paid') is_paid
  FROM debt d
  JOIN payment_debt_mappings pdm ON pdm.debt_id = d.id
  JOIN payment_statuses ps ON ps.id = pdm.payment_id
  GROUP BY d.id
);

-- Down Migration

ALTER TABLE debt ALTER COLUMN credited DROP EXPRESSION;

UPDATE debt SET credited = credited_at IS NOT NULL;

ALTER TABLE debt
  DROP CONSTRAINT credited_no_subject_without_timestamp,
  DROP CONSTRAINT published_no_subject_without_timestamp;

ALTER TABLE debt
  DROP COLUMN credited_at CASCADE,
  DROP COLUMN credited_by,
  DROP COLUMN published_by;

CREATE VIEW debt_statuses AS (
  SELECT d.*, bool_or(ps.status = 'paid') is_paid
  FROM debt d
  JOIN payment_debt_mappings pdm ON pdm.debt_id = d.id
  JOIN payment_statuses ps ON ps.id = pdm.payment_id
  GROUP BY d.id
);

