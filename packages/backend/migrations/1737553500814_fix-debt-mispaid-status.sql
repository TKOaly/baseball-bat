-- Up Migration

CREATE OR REPLACE VIEW debt_statuses AS (
  SELECT
    d.id,
    d.payer_id,
    d.description,
    d.name,
    d.debt_center_id,
    d.due_date,
    d.created_at,
    d.updated_at,
    d.last_reminded,
    d.published_at,
    d.payment_condition,
    d.default_payment,
    d.date,
    d.accounting_period,
    d.human_id_nonce,
    d.human_id,
    d.marked_as_paid,
    d.published_by,
    d.credited_by,
    d.credited_at,
    d.credited,
    bool_or(ps.status = 'paid') is_paid,
    CASE
      WHEN bool_or(ps.status = 'paid') THEN 'paid'
      WHEN bool_or(ps.status = 'mispaid') THEN 'mispaid'
      ELSE 'unpaid'
    END status
  FROM debt d
  JOIN payment_debt_mappings pdm ON pdm.debt_id = d.id
  JOIN payment_statuses ps ON ps.id = pdm.payment_id
  GROUP BY d.id
);

-- Down Migration

CREATE OR REPLACE VIEW debt_statuses AS (
  SELECT
    d.id,
    d.payer_id,
    d.description,
    d.name,
    d.debt_center_id,
    d.due_date,
    d.created_at,
    d.updated_at,
    d.last_reminded,
    d.published_at,
    d.payment_condition,
    d.default_payment,
    d.date,
    d.accounting_period,
    d.human_id_nonce,
    d.human_id,
    d.marked_as_paid,
    d.published_by,
    d.credited_by,
    d.credited_at,
    d.credited,
    bool_or(ps.status = 'paid') is_paid
  FROM debt d
  JOIN payment_debt_mappings pdm ON pdm.debt_id = d.id
  JOIN payment_statuses ps ON ps.id = pdm.payment_id
  GROUP BY d.id
);
