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

CREATE TABLE payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payer_id uuid NOT NULL,
  payment_status text NOT NULL,
  stripe_payment_intent_id text NOT NULL,
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

CREATE TABLE line_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL,
  event_id int NOT NULL,
  event_item_id int NOT NULL DEFAULT 0,
  amount int NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  item_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT
    fk_line_items_payments
    FOREIGN KEY (payment_id)
    REFERENCES payments (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

-- Down Migration