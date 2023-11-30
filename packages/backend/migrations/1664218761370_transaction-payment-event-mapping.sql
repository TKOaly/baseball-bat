-- Up Migration

CREATE TABLE payment_event_transaction_mapping (
  payment_event_id UUID NOT NULL UNIQUE,
  bank_transaction_id TEXT NOT NULL UNIQUE,

  CONSTRAINT payment_event_id_fk FOREIGN KEY (payment_event_id) REFERENCES payment_events (id),
  CONSTRAINT bank_transaction_id_fk FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions (id),

  PRIMARY KEY (payment_event_id, bank_transaction_id)
);


-- Down Migration

DROP TABLE payment_event_transaction_mapping;
