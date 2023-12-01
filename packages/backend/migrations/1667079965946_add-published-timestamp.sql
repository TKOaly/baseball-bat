-- Up Migration

ALTER TABLE debt ADD COLUMN published_at TIMESTAMPTZ;
UPDATE debt SET published_at = NOW() WHERE draft = false;

DROP VIEW debt_statuses;

ALTER TABLE debt DROP COLUMN draft;

CREATE VIEW debt_statuses AS (
  SELECT d.*, bool_or(ps.status = 'paid') is_paid
  FROM debt d
  JOIN payment_debt_mappings pdm ON pdm.debt_id = d.id
  JOIN payment_statuses ps ON ps.id = pdm.payment_id
  GROUP BY d.id
);

-- Down Migration

ALTER TABLE debt ADD COLUMN draft NOT NULL AS (published_at IS NULL);
ALTER TABLE debt DROP COLUMN published_at;
