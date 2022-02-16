-- Up Migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE payer_profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  upstream_id int NOT NULL UNIQUE,
  email citext NOT NULL,
  stripe_customer_id text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE payment_methods (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payer_id uuid NOT NULL UNIQUE,
  stripe_pm_id text NOT NULL,
  brand text NOT NULL,
  exp_month int NOT NULL,
  exp_year int NOT NULL,
  last4 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_payment_methods_payers
    FOREIGN KEY (payer_id)
    REFERENCES payer_profiles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE event_payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  event_id int NOT NULL,
  payer_id uuid NOT NULL,
  payment_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT fk_payer_event_payments
    FOREIGN KEY (payer_id)
    REFERENCES payer_profiles (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT status_check CHECK (payment_status IN (
    'requires_payment_method',
    'requires_confirmation', 
    'requires_action',
    'processing',
    'requires_capture',
    'canceled',
    'succeeded'
  ))
);

-- Down Migration