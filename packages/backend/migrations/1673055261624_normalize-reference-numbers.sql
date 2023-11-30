-- Up Migration

CREATE FUNCTION normalize_reference_number(reference TEXT)
RETURNS TEXT
AS $$
  SELECT REGEXP_REPLACE(UPPER(LTRIM(reference, '0')), '[^A-Z0-9]', '', 'g')
$$
LANGUAGE SQL;

UPDATE payments
  SET data = JSONB_SET(data, '{reference_number}', to_jsonb(normalize_reference_number(data->>'reference_number')))
  WHERE type = 'invoice';

-- Down Migration

DROP FUNCTION normalize_reference_number;
