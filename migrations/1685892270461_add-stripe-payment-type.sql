-- Up Migration

ALTER TABLE payments DROP CONSTRAINT check_type;
ALTER TABLE payments ADD CONSTRAINT check_type CHECK (type IN ('invoice', 'cash', 'stripe'));

ALTER TABLE payment_events DROP CONSTRAINT check_type;
ALTER TABLE payment_events ADD CONSTRAINT check_type CHECK (type IN ('created', 'payment', 'other', 'canceled', 'failed', 'stripe.intent-created'));

-- Down Migration

-- ALTER TABLE payments DROP CONSTRAINT check_type;
-- ALTER TABLE payments ADD CONSTRAINT check_type CHECK (type IN ('invoice', 'cash'));

-- ALTER TABLE payment_events DROP CONSTRAINT check_type;
-- ALTER TABLE payment_events ADD CONSTRAINT check_type CHECK (type IN ('created', 'payment', 'other', 'canceled'));
