-- Up Migration

ALTER TABLE debt
  ADD COLUMN payment_condition INT,
  ADD COLUMN default_payment uuid,
  ADD CONSTRAINT fk_default_payment FOREIGN KEY (default_payment) REFERENCES payments (id);

UPDATE debt
SET default_payment = (
  WITH augmented_payments AS (
    SELECT
      p.id,
      p.type,
      p.created_at,
      (SELECT ARRAY_AGG(debt_id) FROM payment_debt_mappings WHERE payment_id = p.id) AS debt_ids
    FROM payments p
    JOIN payment_statuses s ON s.id = p.id
  )
  SELECT p.id
  FROM augmented_payments p
  WHERE debt.id = ANY (p.debt_ids) AND ARRAY_LENGTH(p.debt_ids, 1) = 1 AND p.type = 'invoice'
  ORDER BY p.created_at
  LIMIT 1
);

-- Down Migration

ALTER TABLE debt
  DROP COLUMN payment_condition,
  DROP COLUMN default_payment;
