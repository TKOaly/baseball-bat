-- Up Migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "citext";

CREATE TABLE payer_profiles (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  stripe_customer_id TEXT,
  tkoaly_user_id INT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE payer_emails (
  email TEXT NOT NULL,
  payer_id uuid NOT NULL,
  priority TEXT NOT NULL DEFAULT 'default',
  source TEXT NOT NULL DEFAULT 'other',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email),
  CONSTRAINT fk_payer_id FOREIGN KEY (payer_id) REFERENCES payer_profiles (id),
  CONSTRAINT priority_check CHECK (priority IN ('primary', 'default', 'disabled')),
  CONSTRAINT source_check CHECK (source IN ('tkoaly', 'other', 'user'))
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

CREATE TABLE payment_debt_mappings (
  debt_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  PRIMARY KEY (debt_id, payment_id)
);

CREATE TABLE payments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  data JSONB NOT NULL, 
  message TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT check_type CHECK (type IN ('invoice'))
);

CREATE TYPE payment_status AS ENUM ('unpaid', 'mispaid', 'paid', 'canceled');

CREATE TABLE payment_events (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_id uuid NOT NULL,
  type TEXT NOT NULL,
  amount INT NOT NULL DEFAULT 0,
  data JSON,
  time timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT check_type CHECK (type IN ('created', 'payment', 'other', 'canceled')),
  CONSTRAINT check_created_negative CHECK (type <> 'created' OR amount < 0),
  CONSTRAINT fk_payment_id
    FOREIGN KEY (payment_id)
    REFERENCES payments (id)
);

CREATE TABLE debt_center (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE debt (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payer_id uuid NOT NULL,
  description TEXT NOT NULL,
  name TEXT NOT NULL,
  draft BOOLEAN DEFAULT true,
  debt_center_id uuid NOT NULL,
  due_date DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_payer_id
    FOREIGN KEY (payer_id)
    REFERENCES payer_profiles (id),
  CONSTRAINT fk_debt_center_id
    FOREIGN KEY (debt_center_id)
    REFERENCES debt_center (id),
  PRIMARY KEY (id)
);

CREATE VIEW payment_statuses AS (
  SELECT
    p.id,
    s.balance,
    s.updated_at,
    CASE
      WHEN s.has_cancel_event        THEN 'canceled'::payment_status
      WHEN (NOT s.has_payment_event) THEN 'unpaid'::payment_status
      WHEN (s.balance <> 0)          THEN 'mispaid'::payment_status
                                     ELSE 'paid'::payment_status
    END AS status,
    TO_JSON(pp.*) AS payer
  FROM payments p
  LEFT JOIN (
    SELECT
      e.payment_id,
      SUM(e.amount) AS balance,
      SUM(CASE WHEN e.type = 'payment' THEN 1 ELSE 0 END) > 0 AS has_payment_event,
      SUM(CASE WHEN e.type = 'canceled'  THEN 1 ELSE 0 END) > 0 AS has_cancel_event,
      MAX(e.time) AS updated_at
    FROM payment_events e
  	GROUP BY e.payment_id
  ) s ON s.payment_id = p.id
  LEFT JOIN payment_debt_mappings pdm ON pdm.payment_id = p.id
  LEFT JOIN debt d ON d.id = pdm.debt_id
  LEFT JOIN payer_profiles pp ON pp.id = d.payer_id
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

CREATE TABLE debt_component (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  variant uuid,
  debt_center_id uuid NOT NULL,
  amount INTEGER NOT NULL,
  CONSTRAINT fk_debt_center_id
    FOREIGN KEY (debt_center_id)
    REFERENCES debt_center (id),
  PRIMARY KEY (id)
);

CREATE TABLE debt_component_mapping (
  debt_id uuid NOT NULL,
  debt_component_id uuid NOT NULL,
  CONSTRAINT fk_debt_id
    FOREIGN KEY (debt_id)
    REFERENCES debt (id),
  CONSTRAINT fk_debt_component_id
    FOREIGN KEY (debt_component_id)
    REFERENCES debt_component (id),
  PRIMARY KEY (debt_id, debt_component_id)
);

CREATE TABLE translations (
  string_id uuid NOT NULL,
  language_code TEXT NOT NULL,
  translation TEXT NOT NULL,
  PRIMARY KEY (string_id, language_code)
);

CREATE TABLE debt_line (
  debt_id uuid NOT NULL,
  debt_component_id uuid NOT NULL,
  CONSTRAINT fk_debt_id
    FOREIGN KEY (debt_id)
    REFERENCES debt (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_debt_component_id
    FOREIGN KEY (debt_component_id)
    REFERENCES debt_component (id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
);

CREATE TABLE payment_event (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  method TEXT NOT NULL,
  options JSON
);

CREATE TABLE payment_event_debts (
  payment_event_id uuid NOT NULL,
  debt_id uuid NOT NULL
);

CREATE TABLE payment_event_log (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  payment_event_id uuid NOT NULL,
  action TEXT NOT NULL,
  payload JSON,
  CONSTRAINT action_check CHECK (action IN (
    'canceled',
    'failed',
    'succeeded',
    'updated'
  ))
);

CREATE TABLE emails (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT,
  html TEXT,
  text TEXT NOT NULL,
  draft BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  payload JSON,
  PRIMARY KEY (id)
);

-- Down Migration
