-- Up Migration

CREATE OR REPLACE FUNCTION normalize_reference_number(reference TEXT)
RETURNS TEXT
AS $$
  SELECT REGEXP_REPLACE(REGEXP_REPLACE(UPPER(LTRIM(reference, '0')), '[^A-Z0-9]', '', 'g'), '^(RF[0-9]{2})0+', '\1', '')
$$
LANGUAGE SQL;

ALTER TABLE bank_transactions ADD COLUMN original_reference TEXT;

CREATE FUNCTION normalize_bank_transaction_reference() RETURNS trigger AS $$
  BEGIN
    NEW.original_reference := NEW.reference;

    IF NEW.reference IS NOT NULL THEN
      NEW.reference := normalize_reference_number(NEW.reference);
    END IF;

    RETURN NEW;
  END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER normalize_bank_transaction_reference
  BEFORE INSERT OR UPDATE
  ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION normalize_bank_transaction_reference();

UPDATE payments
  SET data = JSONB_SET(data, '{reference_number}', to_jsonb(normalize_reference_number(data->>'reference_number')))
  WHERE type = 'invoice';

UPDATE bank_transactions
  SET reference = normalize_reference_number(reference)
  WHERE reference IS NOT NULL;

-- Down Migration

DROP TRIGGER normalize_bank_transaction_reference ON bank_transactions;

ALTER TABLE bank_transactions DROP COLUMN original_reference;

CREATE OR REPLACE FUNCTION normalize_reference_number(reference TEXT)
RETURNS TEXT
AS $$
  SELECT REGEXP_REPLACE(UPPER(LTRIM(reference, '0')), '[^A-Z0-9]', '', 'g')
$$
LANGUAGE SQL;
