-- Up Migration

CREATE UNIQUE INDEX bank_transactions_id_unique ON bank_transactions (id);

-- Down Migration

DROP INDEX bank_transactions_id_unique;
