-- Schema of docs/03 §4. dt_vault_snapshot and dt_audit_log are created here but written only from KM-009.

CREATE TABLE dt_user (
  id                  TEXT PRIMARY KEY,
  username            TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kdf_name            TEXT NOT NULL DEFAULT 'PBKDF2-SHA256',
  kdf_iter            INTEGER NOT NULL,
  kdf_salt            TEXT NOT NULL,
  auth_hash           TEXT NOT NULL,
  wrapped_account_key TEXT NOT NULL,
  security_stamp      TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);

CREATE TABLE dt_vault (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES dt_user(id) ON DELETE CASCADE,
  wrapped_vault_key   TEXT NOT NULL,
  meta                TEXT NOT NULL,
  meta_version        INTEGER NOT NULL,
  version             INTEGER NOT NULL,
  blob                TEXT NOT NULL,
  size                INTEGER NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  updated_by_session  TEXT
);
CREATE INDEX dt_vault_user_id_idx ON dt_vault(user_id);

CREATE TABLE dt_vault_snapshot (
  vault_id            TEXT NOT NULL REFERENCES dt_vault(id) ON DELETE CASCADE,
  version             INTEGER NOT NULL,
  blob                TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  PRIMARY KEY (vault_id, version)
);

CREATE TABLE dt_session (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES dt_user(id) ON DELETE CASCADE,
  token_hash          TEXT NOT NULL UNIQUE,
  security_stamp      TEXT NOT NULL,
  device_name         TEXT,
  created_at          INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL,
  expires_at          INTEGER NOT NULL
);
CREATE INDEX dt_session_user_id_idx ON dt_session(user_id);

-- key is an HMAC under SERVER_SECRET: neither a username nor an IP can be read back (KM-005 NFR02).
CREATE TABLE sys_auth_attempt (
  key                 TEXT PRIMARY KEY,
  count               INTEGER NOT NULL,
  window_start        INTEGER NOT NULL,
  locked_until        INTEGER
);

CREATE TABLE dt_audit_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             TEXT,
  session_id          TEXT,
  vault_id            TEXT,
  at                  INTEGER NOT NULL,
  action              TEXT NOT NULL,
  meta                TEXT
);
CREATE INDEX dt_audit_log_user_id_at_idx ON dt_audit_log(user_id, at DESC);
