-- Up Migration

CREATE TABLE accounting_periods (
  year INT PRIMARY KEY,
  closed BOOLEAN NOT NULL DEFAULT false
  -- is_default BOOLEAN NOT NULL DEFAULT false
);

-- INSERT INTO accounting_periods (year, is_default) VALUES (2022, true);
-- CREATE UNIQUE INDEX accounting_periods_only_one_default ON accounting_periods (is_default) WHERE (is_default = true);

CREATE TYPE human_id_sequence_type AS ENUM ('DEBT', 'RPRT', 'PAYM', 'DCTR');

CREATE TABLE human_sequences (
  accounting_period INT NOT NULL,
  label human_id_sequence_type NOT NULL,
  counter INT NOT NULL DEFAULT 0,
  PRIMARY KEY (accounting_period, label),
  CONSTRAINT fk_accounting_period
    FOREIGN KEY (accounting_period)
    REFERENCES accounting_periods (year)
);

CREATE FUNCTION upsert_accounting_period(year INT)
RETURNS INT
AS $$
BEGIN
  IF EXISTS (SELECT FROM accounting_periods p WHERE p.year = $1) THEN
    RETURN $1;
  ELSE
    INSERT INTO accounting_periods (year, closed) VALUES ($1, false);
    RETURN $1;
  END IF;
END;
$$
LANGUAGE PLPGSQL;

CREATE FUNCTION get_default_accounting_period()
RETURNS INT
AS $$
DECLARE current_year INT;
DECLARE period_exists INT;
BEGIN
  current_year := DATE_PART('year', CURRENT_DATE);
  RETURN upsert_accounting_period(current_year);
END;
$$
LANGUAGE PLPGSQL;

CREATE FUNCTION format_human_id(label human_id_sequence_type, year INT, counter INT)
RETURNS TEXT
AS $$ SELECT $1::text || '-' || LPAD($2::text, 4, '0') || '-' || LPAD($3::text, 4, '0') $$
LANGUAGE SQL
IMMUTABLE;

CREATE FUNCTION generate_human_id_nonce(
  sequence_type human_id_sequence_type,
  year INT
)
RETURNS INT AS $$
DECLARE result INT;
BEGIN

  UPDATE human_sequences
    SET counter = counter + 1
    WHERE label = sequence_type AND accounting_period = $2
    RETURNING counter 
    INTO result;

  IF NOT found THEN
    INSERT INTO human_sequences (accounting_period, label)
      VALUES (year, $1)
      RETURNING counter
      INTO result;
  END IF;

  RETURN result;
END;
$$ LANGUAGE PLPGSQL;

CREATE FUNCTION generate_human_id (
  sequence_type human_id_sequence_type,
  year INT DEFAULT NULL
) RETURNS TEXT AS $$
DECLARE result TEXT;
DECLARE accounting_year INT;
DECLARE nonce INT;
BEGIN
  SELECT COALESCE($2, get_default_accounting_period()) INTO accounting_year;
  SELECT generate_human_id_nonce(sequence_type, accounting_year) INTO nonce;
  RETURN format_human_id(sequence_type, accounting_year, nonce);
END;
$$ LANGUAGE PLPGSQL;

CREATE FUNCTION human_id_generation_trigger()
RETURNS trigger
LANGUAGE PLPGSQL
AS $$
  BEGIN
    NEW.human_id_nonce := generate_human_id_nonce(TG_ARGV[0]::human_id_sequence_type, NEW.accounting_period);
    return NEW;
  END;
$$;

ALTER TABLE debt
  ADD COLUMN accounting_period INT,
  ADD COLUMN human_id_nonce INT,
  ADD COLUMN human_id TEXT UNIQUE
    GENERATED ALWAYS AS (format_human_id('DEBT', accounting_period, human_id_nonce)) STORED;

UPDATE debt SET accounting_period = upsert_accounting_period(DATE_PART('year', COALESCE(date, created_at))::int);

ALTER TABLE debt
  ALTER COLUMN accounting_period SET NOT NULL,
  ALTER COLUMN accounting_period SET DEFAULT get_default_accounting_period();

CREATE TRIGGER debt_default_human_id
BEFORE INSERT ON debt
FOR EACH ROW
WHEN (NEW.human_id_nonce IS NULL)
EXECUTE FUNCTION human_id_generation_trigger('DEBT');

UPDATE debt SET human_id_nonce = generate_human_id_nonce('DEBT'::human_id_sequence_type, accounting_period);

ALTER TABLE debt_center
  ADD COLUMN accounting_period INT,
  ADD COLUMN human_id_nonce INT,
  ADD COLUMN human_id TEXT UNIQUE
    GENERATED ALWAYS AS (format_human_id('DCTR', accounting_period, human_id_nonce)) STORED;

UPDATE debt_center SET accounting_period = upsert_accounting_period((SELECT COALESCE(MIN(debt.accounting_period), DATE_PART('year', debt_center.created_at))::int FROM debt WHERE debt.debt_center_id = debt_center.id));
UPDATE debt_center SET human_id_nonce = generate_human_id_nonce('DCTR'::human_id_sequence_type, accounting_period);

ALTER TABLE debt_center
  ALTER COLUMN accounting_period SET NOT NULL,
  ALTER COLUMN accounting_period SET DEFAULT get_default_accounting_period(),
  ALTER COLUMN human_id_nonce SET NOT NULL;

CREATE TRIGGER debt_center_default_human_id
BEFORE INSERT ON debt_center
FOR EACH ROW
WHEN (NEW.human_id_nonce IS NULL)
EXECUTE FUNCTION human_id_generation_trigger('DCTR');

ALTER TABLE reports
  ADD COLUMN accounting_period INT
    DEFAULT get_default_accounting_period(),
  ADD COLUMN human_id_nonce INT,
  ADD COLUMN human_id TEXT UNIQUE
    GENERATED ALWAYS AS (format_human_id('RPRT', accounting_period, human_id_nonce)) STORED;

CREATE TRIGGER report_default_human_id
BEFORE INSERT ON reports
FOR EACH ROW
WHEN (NEW.human_id_nonce IS NULL)
EXECUTE FUNCTION human_id_generation_trigger('RPRT');

UPDATE reports SET human_id_nonce = generate_human_id_nonce('RPRT'::human_id_sequence_type, accounting_period);

ALTER TABLE payments
  ADD COLUMN accounting_period INT,
  ADD COLUMN human_id TEXT UNIQUE
    GENERATED ALWAYS AS ('PAYM-' || payment_number) STORED;

UPDATE payments SET accounting_period = upsert_accounting_period(DATE_PART('year', created_at)::int);

ALTER TABLE payments
  ALTER COLUMN accounting_period SET NOT NULL,
  ALTER COLUMN accounting_period SET DEFAULT get_default_accounting_period();

CREATE FUNCTION payment_number_generation_trigger_func()
RETURNS trigger
LANGUAGE PLPGSQL
AS $$
  DECLARE nonce INT;
  BEGIN
    nonce := generate_human_id_nonce('PAYM'::human_id_sequence_type, NEW.accounting_period);
    NEW.payment_number := NEW.accounting_period || '-' || LPAD(nonce::text, 4, '0');
    RETURN NEW;
  END;
$$;

CREATE TRIGGER payment_number_generation_trigger
BEFORE INSERT ON payments
FOR EACH ROW
WHEN (NEW.payment_number IS NULL)
EXECUTE FUNCTION payment_number_generation_trigger_func();

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

-- Down Migration

DROP VIEW resource_ts;

CREATE VIEW resource_ts AS (
  SELECT
    COALESCE(debt.name, '') || ' ' ||
    COALESCE(debt.description, '') || ' ' ||
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

DROP TRIGGER debt_default_human_id ON debt;
DROP TRIGGER report_default_human_id ON reports;
DROP TRIGGER debt_center_default_human_id ON debt_center;
DROP TRIGGER payment_number_generation_trigger ON payments;
ALTER TABLE debt DROP COLUMN human_id, DROP COLUMN human_id_nonce, DROP COLUMN accounting_period;
ALTER TABLE debt_center DROP COLUMN human_id, DROP COLUMN human_id_nonce, DROP COLUMN accounting_period;
ALTER TABLE reports DROP COLUMN human_id, DROP COLUMN human_id_nonce, DROP COLUMN accounting_period;
ALTER TABLE payments DROP COLUMN human_id, DROP COLUMN accounting_period;
DROP FUNCTION human_id_generation_trigger;
DROP FUNCTION payment_number_generation_trigger_func;
DROP FUNCTION generate_human_id;
DROP FUNCTION generate_human_id_nonce;
DROP FUNCTION format_human_id;
DROP FUNCTION get_default_accounting_period;
DROP FUNCTION upsert_accounting_period;
DROP TABLE human_sequences;
DROP TYPE human_id_sequence_type;
DROP TABLE accounting_periods;
