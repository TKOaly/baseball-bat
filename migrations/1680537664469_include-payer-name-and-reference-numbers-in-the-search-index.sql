-- Up Migration

DROP VIEW resource_ts;

CREATE VIEW resource_ts AS (
  SELECT
    COALESCE(debt.name, '') || ' ' ||
    COALESCE(debt.description, '') || ' ' ||
    COALESCE(debt.human_id, '') || ' ' ||
    (
      SELECT payer_profiles.name
      FROM payer_profiles
      WHERE payer_profiles.id = debt.payer_id
    ) AS text,
    'debt' AS type,
    debt.name,
    debt.id::text AS id
  FROM debt
  UNION ALL
  SELECT
    COALESCE(payer.name, '') || ' ' ||
    (
      SELECT STRING_AGG(pe.email, ' ')
      FROM payer_emails pe
      WHERE pe.payer_id = payer.id
    ) AS text,
    'payer' AS type,
    payer.name,
    payer.id::text AS id
  FROM payer_profiles payer
  UNION ALL
  SELECT
    COALESCE(tx.other_party_name, '') || ' ' ||
    COALESCE(tx.message, '') || ' ' ||
    COALESCE(tx.reference, '') AS text,
    'transaction' AS type,
    COALESCE(tx.reference, tx.message) AS name,
    tx.id
  FROM bank_transactions tx
  UNION ALL
  SELECT
    COALESCE(
      CASE
          WHEN (p.type = 'invoice'::text) THEN (p.data ->> 'reference_number'::text)
          ELSE NULL::text
      END,
      ''::text
    ) || ' '::text ||
    COALESCE(pp.name, ''::text) || ' '::text ||
    COALESCE(p.title, ''::text) || ' '::text ||
    COALESCE(p.message, ''::text) || ' '::text ||
    COALESCE(p.payment_number, ''::text) AS text,
    'payment'::text AS type,
    p.title AS name,
    p.id::text AS id
  FROM payments p
  JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
  JOIN debt d ON d.id = pdm.debt_id
  JOIN payer_profiles pp ON pp.id = d.payer_id
  UNION ALL
  SELECT
    COALESCE(dc.name, '') || ' ' ||
    COALESCE(dc.description, '') AS text,
    'debt_center' AS type,
    dc.name,
    dc.id::text AS id
   FROM debt_center dc
);

-- Down Migration

DROP VIEW resource_ts;

CREATE VIEW resource_ts AS (
  SELECT
    COALESCE(debt.name, '') || ' ' ||
    COALESCE(debt.description, '') || ' ' ||
    COALESCE(debt.human_id, '') || ' ' ||
    (
      SELECT payer_profiles.name
      FROM payer_profiles
      WHERE payer_profiles.id = debt.payer_id
    ) AS text,
    'debt' AS type,
    debt.name,
    debt.id::text AS id
  FROM debt
  UNION ALL
  SELECT
    COALESCE(payer.name, '') || ' ' ||
    (
      SELECT STRING_AGG(pe.email, ' ')
      FROM payer_emails pe
      WHERE pe.payer_id = payer.id
    ) AS text,
    'payer' AS type,
    payer.name,
    payer.id::text AS id
  FROM payer_profiles payer
  UNION ALL
  SELECT
    COALESCE(tx.other_party_name, '') || ' ' ||
    COALESCE(tx.message, '') || ' ' ||
    COALESCE(tx.reference, '') AS text,
    'transaction' AS type,
    COALESCE(tx.reference, tx.message) AS name,
    tx.id
  FROM bank_transactions tx
  UNION ALL
  SELECT
    COALESCE(p.title, '') || ' ' ||
    COALESCE(p.message, '') || ' ' ||
    -- COALESCE(p.human_id, '') || ' ' ||
    COALESCE(p.payment_number, '') AS text,
    'payment' AS type,
    p.title AS name,
    p.id::text AS id
  FROM payments p
  UNION ALL
  SELECT
    COALESCE(dc.name, '') || ' ' ||
    COALESCE(dc.description, '') AS text,
    'debt_center' AS type,
    dc.name,
    dc.id::text AS id
   FROM debt_center dc
);
