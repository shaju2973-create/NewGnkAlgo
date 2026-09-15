BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE user_role AS ENUM ('user','admin');
CREATE TYPE identity_kind AS ENUM ('google','mobile');
CREATE TYPE broker_name AS ENUM ('dhan','fyers','zerodha','angelone','upstox');

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text, display_name text,
 role user_role NOT NULL DEFAULT 'user', disabled_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_ci_uq ON users(lower(email)) WHERE email IS NOT NULL;

CREATE TABLE user_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind identity_kind NOT NULL, provider_subject text NOT NULL, verified_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(kind,provider_subject), UNIQUE(user_id,kind)
);
CREATE TABLE app_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE otp_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mobile_hash bytea NOT NULL, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, attempt_count smallint NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_attempts_mobile_idx ON otp_attempts(mobile_hash,created_at DESC);
CREATE TABLE broker_oauth_states (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 broker broker_name NOT NULL, state_hash bytea NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE user_broker_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 broker broker_name NOT NULL, client_id text NOT NULL, broker_user_id text,
 encrypted_access_token text NOT NULL, encrypted_vendor_key text, encryption_key_version text NOT NULL,
 token_generated_at timestamptz NOT NULL, session_expiry_timestamp timestamptz NOT NULL,
 revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,broker)
);
CREATE INDEX active_broker_tokens_idx ON user_broker_tokens(user_id,session_expiry_timestamp) WHERE revoked_at IS NULL;
CREATE TABLE trade_worker_state (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT true,
 changed_at timestamptz NOT NULL DEFAULT now(), reason text
);
CREATE TABLE security_audit_log (
 id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id) ON DELETE SET NULL, event_type text NOT NULL,
 broker broker_name, request_id text, ip_hash bytea, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO users(email,display_name,role) VALUES('gnkalgo.admin@gmail.com','gnkalgo Admin','admin') ON CONFLICT DO NOTHING;
COMMIT;
