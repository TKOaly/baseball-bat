-- Up Migration

CREATE TABLE bank_accounts (
  iban TEXT PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TYPE credit_or_debit AS ENUM ('credit', 'debit');

CREATE TABLE bank_transactions (
  id TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  amount INT NOT NULL,
  type credit_or_debit NOT NULL,
  other_party_account TEXT,
  other_party_name TEXT NOT NULL,
  value_time timestamptz NOT NULL,
  reference TEXT,
  message TEXT,

  CONSTRAINT account_fk FOREIGN KEY (account) REFERENCES bank_accounts (iban)
);

CREATE TABLE bank_statements (
  id TEXT PRIMARY KEY,
  generated_at timestamptz NOT NULL,
  imported_at timestamptz NOT NULL,
  account TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL
);

CREATE TABLE bank_statement_transaction_mapping (
  bank_statement_id TEXT NOT NULL,
  bank_transaction_id TEXT NOT NULL,

  CONSTRAINT bank_statement_id_fk FOREIGN KEY (bank_statement_id) REFERENCES bank_statements (id),
  CONSTRAINT bank_transaction_id_fk FOREIGN KEY (bank_transaction_id) REFERENCES bank_transactions (id)
);

-- Down Migration

DROP TABLE bank_statement_transaction_mapping;
DROP TABLE bank_statements;
DROP TABLE bank_transactions;
DROP TABLE bank_accounts;
DROP TYPE credit_or_debit;
