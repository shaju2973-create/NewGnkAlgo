BEGIN;

CREATE TABLE user_credentials (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  password_hash text NOT NULL,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  failed_attempts smallint NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mobile_verification_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text NOT NULL,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz,
  replaced_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_active_idx ON refresh_tokens(user_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE password_reset_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE otp_attempts ADD COLUMN purpose text NOT NULL DEFAULT 'register';
ALTER TABLE otp_attempts ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;

-- Remove only the untouched placeholder seed. Existing/claimed accounts are preserved.
DELETE FROM users u
WHERE lower(u.email) = 'gnkalgo.admin@gmail.com'
  AND NOT EXISTS (SELECT 1 FROM user_identities i WHERE i.user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM user_broker_tokens b WHERE b.user_id=u.id);

COMMIT;
