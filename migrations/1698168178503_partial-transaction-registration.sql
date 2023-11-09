-- Up Migration

CREATE OR REPLACE FUNCTION check_transaction_registration_sum() RETURNS trigger AS $trig$
  DECLARE
    transaction_id text;
    amounts integer[];
    amount integer;
    amount_sum integer;
    polarity text;
    event payment_events;
    transaction bank_transactions;
    event_sum integer;
  BEGIN
    IF (TG_TABLE_NAME = 'payment_event_transaction_mapping') THEN
      transaction_id := NEW.bank_transaction_id;
    ELSIF (TG_TABLE_NAME = 'payment_events') THEN
      transaction_id := (SELECT bank_transaction_id FROM payment_event_transaction_mapping WHERE payment_event_id = NEW.id);
    ELSIF (TG_TABLE_NAME = 'bank_transactions') THEN
      transaction_id := NEW.id;
    END IF;

    IF transaction_id IS NULL THEN
      RETURN NEW;
    END IF;

    RAISE NOTICE 'Executed for % (ID: %)', TG_TABLE_NAME, transaction_id;

    SELECT *
    FROM bank_transactions
    INTO transaction
    WHERE id = transaction_id
    FOR UPDATE; -- Acquires an exclusive lock on the transaction row.

    amount_sum := 0;

    FOR amount IN
      SELECT e.amount
      FROM payment_events e
      INNER JOIN payment_event_transaction_mapping m ON m.payment_event_id = e.id
      WHERE m.bank_transaction_id = transaction_id
    LOOP
      amount_sum := amount_sum + amount;

      CASE
        WHEN amount > 0 THEN polarity := 'positive';
        WHEN amount < 0 THEN polarity := 'negative';
        ELSE CONTINUE;
      END CASE;

      RAISE NOTICE '% and %', polarity, transaction.type;

      IF ((transaction.type = 'credit' AND amount < 0) OR (transaction.type = 'debit' AND amount > 0)) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'BB001',
          MESSAGE = 'Invalid amount polarity.',
          DETAIL = format('A %s payment event registered for a %s transaction!', polarity, transaction.type),
          TABLE = TG_TABLE_NAME;
      END IF;
    END LOOP;

    IF (ABS(amount_sum) > ABS(transaction.amount)) THEN
      RAISE EXCEPTION USING
        ERRCODE = 'BB002',
        MESSAGE = 'Payment events exceed the amount of the transaction!',
        DETAIL = format('Payments events associated with the transaction exceed the amount of the transaction. (%s out of %s)', amount_sum, transaction.amount),
        TABLE = TG_TABLE_NAME;
    END IF;

    RAISE NOTICE 'Amount: % / %', amount_sum, transaction.amount;

    RETURN NEW;
  END;
$trig$ LANGUAGE plpgsql;

CREATE TRIGGER payment_event_transaction_mapping_sum_check
  BEFORE INSERT OR UPDATE
  ON payment_event_transaction_mapping
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_registration_sum();

CREATE TRIGGER payment_events_sum_check
  BEFORE INSERT OR UPDATE
  ON payment_events
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_registration_sum();

CREATE TRIGGER bank_transactions_sum_check
  BEFORE INSERT OR UPDATE
  ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_registration_sum();

-- Down Migration

DROP TRIGGER payment_event_transaction_mapping_sum_check ON payment_event_transaction_mapping;
DROP TRIGGER payment_events_sum_check ON payment_events;
DROP TRIGGER bank_transactions_sum_check ON bank_transactions;
DROP FUNCTION check_transaction_registration_sum;
