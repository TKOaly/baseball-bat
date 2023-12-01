-- Up Migration

ALTER TABLE payments DROP CONSTRAINT check_type;
ALTER TABLE payments ADD CONSTRAINT check_type CHECK (type IN ('invoice', 'cash'));

CREATE VIEW debt_statuses AS (
  SELECT d.*, bool_or(ps.status = 'paid') is_paid
  FROM debt d
  JOIN payment_debt_mappings pdm ON pdm.debt_id = d.id
  JOIN payment_statuses ps ON ps.id = pdm.payment_id
  GROUP BY d.id
);

-- Down Migration

DROP VIEW debt_statuses;

ALTER TABLE payments DROP CONSTRAINT check_type;
ALTER TABLE payments ADD CONSTRAINT check_type CHECK (type IN ('invoice'));
