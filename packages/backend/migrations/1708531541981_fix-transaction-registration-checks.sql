-- Up Migration

DROP TRIGGER payment_event_transaction_mapping_sum_check ON payment_event_transaction_mapping;
DROP TRIGGER payment_events_sum_check ON payment_events;
DROP TRIGGER bank_transactions_sum_check ON bank_transactions;

CREATE TRIGGER payment_event_transaction_mapping_sum_check
  AFTER INSERT OR UPDATE
  ON payment_event_transaction_mapping
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_registration_sum();

CREATE TRIGGER payment_events_sum_check
  AFTER INSERT OR UPDATE
  ON payment_events
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_registration_sum();

CREATE TRIGGER bank_transactions_sum_check
  AFTER INSERT OR UPDATE
  ON bank_transactions
  FOR EACH ROW
  EXECUTE FUNCTION check_transaction_registration_sum();

ALTER TABLE payment_event_transaction_mapping
  DROP CONSTRAINT payment_event_transaction_mapping_bank_transaction_id_key;

-- Down Migration

DROP TRIGGER payment_event_transaction_mapping_sum_check ON payment_event_transaction_mapping;
DROP TRIGGER payment_events_sum_check ON payment_events;
DROP TRIGGER bank_transactions_sum_check ON bank_transactions;

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

CREATE UNIQUE INDEX payment_event_transaction_mapping_bank_transaction_id_key ON payment_event_transaction_mapping (bank_transaction_id);
