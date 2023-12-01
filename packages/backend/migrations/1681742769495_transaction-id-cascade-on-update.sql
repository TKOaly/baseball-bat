-- Up Migration

ALTER TABLE bank_statement_transaction_mapping
DROP CONSTRAINT bank_transaction_id_fk;

ALTER TABLE bank_statement_transaction_mapping
ADD CONSTRAINT bank_transaction_id_fk
FOREIGN KEY (bank_transaction_id)
REFERENCES bank_transactions (id)
ON UPDATE CASCADE;

ALTER TABLE payment_event_transaction_mapping
DROP CONSTRAINT bank_transaction_id_fk;

ALTER TABLE payment_event_transaction_mapping
ADD CONSTRAINT bank_transaction_id_fk
FOREIGN KEY (bank_transaction_id)
REFERENCES bank_transactions (id)
ON UPDATE CASCADE;

-- Down Migration

ALTER TABLE bank_statement_transaction_mapping
DROP CONSTRAINT bank_transaction_id_fk;

ALTER TABLE bank_statement_transaction_mapping
ADD CONSTRAINT bank_transaction_id_fk
FOREIGN KEY (bank_transaction_id)
REFERENCES bank_transactions (id);

ALTER TABLE payment_event_transaction_mapping
DROP CONSTRAINT bank_transaction_id_fk;

ALTER TABLE payment_event_transaction_mapping
ADD CONSTRAINT bank_transaction_id_fk
FOREIGN KEY (bank_transaction_id)
REFERENCES bank_transactions (id);
