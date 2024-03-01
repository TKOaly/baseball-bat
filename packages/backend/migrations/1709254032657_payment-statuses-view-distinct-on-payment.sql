-- Up Migration

CREATE OR REPLACE VIEW payment_statuses AS (
  SELECT DISTINCT ON (p.id)
    p.id,
    s.balance,
    s.updated_at,
    CASE
      WHEN s.has_cancel_event        THEN 'canceled'::payment_status
      WHEN (NOT s.has_payment_event) THEN 'unpaid'::payment_status
      WHEN (s.balance <> 0)          THEN 'mispaid'::payment_status
                                     ELSE 'paid'::payment_status
    END AS status,
    TO_JSON(pp.*) AS payer
  FROM payments p
  LEFT JOIN (
    SELECT
      e.payment_id,
      SUM(e.amount) AS balance,
      SUM(CASE WHEN e.type = 'payment' THEN 1 ELSE 0 END) > 0 AS has_payment_event,
      SUM(CASE WHEN e.type = 'canceled'  THEN 1 ELSE 0 END) > 0 AS has_cancel_event,
      MAX(e.time) AS updated_at
    FROM payment_events e
  	GROUP BY e.payment_id
  ) s ON s.payment_id = p.id
  LEFT JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
  LEFT JOIN debt d ON d.id = pdm.debt_id
  LEFT JOIN payer_profiles pp ON pp.id = d.payer_id
);

-- Down Migration

CREATE OR REPLACE VIEW payment_statuses AS (
  SELECT
    p.id,
    s.balance,
    s.updated_at,
    CASE
      WHEN s.has_cancel_event        THEN 'canceled'::payment_status
      WHEN (NOT s.has_payment_event) THEN 'unpaid'::payment_status
      WHEN (s.balance <> 0)          THEN 'mispaid'::payment_status
                                     ELSE 'paid'::payment_status
    END AS status,
    TO_JSON(pp.*) AS payer
  FROM payments p
  LEFT JOIN (
    SELECT
      e.payment_id,
      SUM(e.amount) AS balance,
      SUM(CASE WHEN e.type = 'payment' THEN 1 ELSE 0 END) > 0 AS has_payment_event,
      SUM(CASE WHEN e.type = 'canceled'  THEN 1 ELSE 0 END) > 0 AS has_cancel_event,
      MAX(e.time) AS updated_at
    FROM payment_events e
  	GROUP BY e.payment_id
  ) s ON s.payment_id = p.id
  LEFT JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
  LEFT JOIN debt d ON d.id = pdm.debt_id
  LEFT JOIN payer_profiles pp ON pp.id = d.payer_id
);
