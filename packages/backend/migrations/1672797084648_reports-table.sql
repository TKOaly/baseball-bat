-- Up Migration

CREATE TABLE reports (
  id UUID PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Down Migration

DROP TABLE reports;
