-- Up Migration

UPDATE payer_profiles p
SET tkoaly_user_id = s.user_id
FROM (
  WITH RECURSIVE merged AS (
    SELECT id AS active_id, id, name, tkoaly_user_id FROM payer_profiles p1 WHERE merged_to IS NULL
    UNION ALL
    SELECT m.active_id, p2.id, p2.name, p2.tkoaly_user_id FROM merged m
    JOIN payer_profiles p2 ON p2.merged_to = m.id
  )
  SELECT
    active_id,
    COUNT(*) OVER (PARTITION BY active_id) count,
    UNNEST(ARRAY_AGG(tkoaly_user_id) FILTER (WHERE tkoaly_user_id IS NOT NULL)) AS user_id
  FROM merged
  WHERE id <> active_id
  GROUP BY active_id
) s
WHERE s.count = 1 AND p.tkoaly_user_id IS NULL AND p.id = s.active_id

-- Down Migration
