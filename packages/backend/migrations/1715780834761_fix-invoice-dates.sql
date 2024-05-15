-- Up Migration

UPDATE payments p
SET data = p.data || jsonb_build_object('due_date', d.due_date::timestamp)
FROM payment_debt_mappings pdm
JOIN debt d ON d.id = pdm.debt_id
WHERE pdm.payment_id = p.id AND type = 'invoice' AND data->>'due_date' IS NULL AND d.due_date IS NOT NULL

-- Down Migration
