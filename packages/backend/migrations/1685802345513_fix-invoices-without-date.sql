-- Up Migration

-- Finds out the 'created_at' and 'date' dates for all debts associated with each payments,
-- selects the latest of these dates, and sets the payments data->date to that value
-- for all payments which do not have that value specified.

UPDATE payments p
SET data = jsonb_set(data, '{date}', to_char(d.date::timestamp at time zone 'UTC', '\"YYYY-MM-DD"T"HH24:MI:SS"Z"\"')::jsonb)
FROM (
  SELECT DISTINCT ON (id) *
  FROM (
    SELECT p.id, UNNEST(array[DATE(d.date), DATE(d.created_at)]) date
    FROM payments p
    JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
    JOIN debt d ON d.id = pdm.debt_id
  ) AS s
  ORDER BY id, date DESC
) AS d
WHERE p.data->>'date' IS NULL AND p.id = d.id AND p.type = 'invoice';

-- Down Migration
