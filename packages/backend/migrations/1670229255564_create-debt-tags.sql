-- Up Migration

CREATE TABLE debt_tags (
  debt_id uuid NOT NULL, 
  name citext NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT fk_debt_id FOREIGN KEY (debt_id) REFERENCES debt (id), 
  PRIMARY KEY (debt_id, name)
);

-- Down Migration

DROP TABLE debt_tags;
