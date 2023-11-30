-- Up Migration

CREATE TABLE email_debt_mapping (
  email_id UUID NOT NULL,
  debt_id UUID NOT NULL,

  CONSTRAINT fk_email_id FOREIGN KEY (email_id) REFERENCES emails (id),
  CONSTRAINT fk_debt_Id FOREIGN KEY (debt_id) REFERENCES debt (id), 

  PRIMARY KEY (email_id, debt_id)
);

-- Down Migration

DROP TABLE email_debt_mapping;
