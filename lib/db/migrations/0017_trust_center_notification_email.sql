-- Trust Center: add notification_email column for access request alerts
ALTER TABLE "trust_center_configs" ADD COLUMN IF NOT EXISTS "notification_email" text;
