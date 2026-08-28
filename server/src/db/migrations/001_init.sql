-- ---------------------------------------------------------------------------
-- 001_init: identity, tenancy and access control
-- ---------------------------------------------------------------------------

-- A user is a single global identity. The same person may hold memberships in
-- several villas (a housekeeper working across two properties, an owner with a
-- portfolio), so nothing tenant-specific lives on this table.
CREATE TABLE users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL,
  email_normalised TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  full_name       TEXT NOT NULL,
  phone           TEXT,
  avatar_colour   TEXT NOT NULL DEFAULT '#0f766e',
  locale          TEXT NOT NULL DEFAULT 'en',
  is_active       INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  last_seen_at    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Refresh tokens are stored hashed and rotated on every use, so a stolen token
-- is single-use and reuse is detectable.
CREATE TABLE refresh_tokens (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  family_id    TEXT NOT NULL,
  user_agent   TEXT,
  ip           TEXT,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

-- The tenant. Every other tenant-owned table carries villa_id and every query
-- filters on it; see server/src/db/index.ts for the scoping helpers.
CREATE TABLE villas (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  address        TEXT,
  timezone       TEXT NOT NULL DEFAULT 'Asia/Makassar',
  currency       TEXT NOT NULL DEFAULT 'IDR',
  week_starts_on INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on BETWEEN 0 AND 6),
  created_by     TEXT NOT NULL REFERENCES users(id),
  archived_at    TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

-- Roles are per-villa so an owner can rename, reshape or invent them freely.
-- `permissions` is a JSON array of permission keys (see src/permissions.ts).
-- System roles are seeded with each villa and cannot be deleted, but every
-- role except owner has a fully editable permission set.
CREATE TABLE roles (
  id           TEXT PRIMARY KEY,
  villa_id     TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  key          TEXT NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  colour       TEXT NOT NULL DEFAULT '#64748b',
  permissions  TEXT NOT NULL DEFAULT '[]',
  is_system    INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  is_owner     INTEGER NOT NULL DEFAULT 0 CHECK (is_owner IN (0, 1)),
  rank         INTEGER NOT NULL DEFAULT 100,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (villa_id, key)
);
CREATE INDEX idx_roles_villa ON roles(villa_id);

-- A membership joins a user to a villa. It is the unit staff records hang off,
-- so employment details (rate, start date, job title) live here rather than on
-- the user.
CREATE TABLE memberships (
  id                  TEXT PRIMARY KEY,
  villa_id            TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id             TEXT NOT NULL REFERENCES roles(id),
  job_title           TEXT,
  employment_type     TEXT NOT NULL DEFAULT 'full_time'
                      CHECK (employment_type IN ('full_time', 'part_time', 'casual', 'contract')),
  pay_rate_minor      INTEGER,
  pay_period          TEXT NOT NULL DEFAULT 'month'
                      CHECK (pay_period IN ('hour', 'day', 'week', 'month')),
  annual_leave_days   REAL NOT NULL DEFAULT 12,
  started_on          TEXT,
  ended_on            TEXT,
  status              TEXT NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active', 'suspended', 'removed')),
  -- Per-member exceptions layered on top of the role:
  -- {"grant": ["expenses:approve"], "deny": ["messages:send"]}
  permission_overrides TEXT NOT NULL DEFAULT '{"grant":[],"deny":[]}',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (villa_id, user_id)
);
CREATE INDEX idx_memberships_villa ON memberships(villa_id, status);
CREATE INDEX idx_memberships_user ON memberships(user_id);

-- Invitations carry only a hash of the token; the plaintext exists once, in the
-- emailed link.
CREATE TABLE invitations (
  id            TEXT PRIMARY KEY,
  villa_id      TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  email_normalised TEXT NOT NULL,
  role_id       TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  job_title     TEXT,
  token_hash    TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invited_by    TEXT NOT NULL REFERENCES users(id),
  accepted_by   TEXT REFERENCES users(id),
  accepted_at   TEXT,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_invitations_villa ON invitations(villa_id, status);
CREATE INDEX idx_invitations_email ON invitations(email_normalised, status);
