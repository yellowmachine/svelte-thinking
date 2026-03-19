-- Migrate user_ai_config from AES-with-password to AWS KMS envelope encryption.
-- Replaces: salt (PBKDF2 key derivation) → encrypted_data_key (KMS-encrypted data key)
-- Adds: enabled (boolean toggle without deleting the key)
-- Updates: provider default → 'openrouter'

ALTER TABLE "user_ai_config" RENAME COLUMN "salt" TO "encrypted_data_key";
--> statement-breakpoint
ALTER TABLE "user_ai_config" ADD COLUMN "enabled" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "user_ai_config" ALTER COLUMN "provider" SET DEFAULT 'openrouter';
