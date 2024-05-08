-- Up Migration

CREATE TABLE audit_log (
  entry_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  subject UUID REFERENCES payer_profiles (id),
  details JSONB,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log_link (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entry_id UUID NOT NULL REFERENCES audit_log (entry_id),
  type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  label TEXT NOT NULL
);

-- Down Migration

DROP TABLE audit_log_link;
DROP TABLE audit_log;
