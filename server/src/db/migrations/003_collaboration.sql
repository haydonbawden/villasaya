-- ---------------------------------------------------------------------------
-- 003_collaboration: attachments, messaging, notifications, audit trail
-- ---------------------------------------------------------------------------

CREATE TABLE attachments (
  id           TEXT PRIMARY KEY,
  villa_id     TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  uploaded_by  TEXT NOT NULL REFERENCES users(id),
  filename     TEXT NOT NULL,
  mime_type    TEXT NOT NULL,
  byte_size    INTEGER NOT NULL,
  storage_key  TEXT NOT NULL UNIQUE,
  checksum     TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_attachments_villa ON attachments(villa_id, created_at);

-- Generic join so a receipt, a task photo and a message image all share one
-- upload path and one storage table.
CREATE TABLE attachment_links (
  attachment_id TEXT NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
  entity_type   TEXT NOT NULL CHECK (entity_type IN ('expense_claim', 'task', 'message', 'leave_request')),
  entity_id     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  PRIMARY KEY (attachment_id, entity_type, entity_id)
);
CREATE INDEX idx_attachment_links_entity ON attachment_links(entity_type, entity_id);

-- A channel is either a named villa channel or a direct message between two or
-- more members. DM membership is fixed at creation.
CREATE TABLE channels (
  id           TEXT PRIMARY KEY,
  villa_id     TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'channel' CHECK (kind IN ('channel', 'direct')),
  name         TEXT,
  topic        TEXT,
  is_private   INTEGER NOT NULL DEFAULT 0 CHECK (is_private IN (0, 1)),
  is_default   INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  -- Sorted, comma-joined membership ids; lets us find or create a DM in one
  -- lookup and keeps duplicates out.
  direct_key   TEXT,
  created_by   TEXT NOT NULL REFERENCES users(id),
  archived_at  TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (villa_id, direct_key)
);
CREATE INDEX idx_channels_villa ON channels(villa_id, kind);

CREATE TABLE channel_members (
  channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'moderator')),
  last_read_at  TEXT,
  muted         INTEGER NOT NULL DEFAULT 0 CHECK (muted IN (0, 1)),
  joined_at     TEXT NOT NULL,
  PRIMARY KEY (channel_id, membership_id)
);
CREATE INDEX idx_channel_members_membership ON channel_members(membership_id);

CREATE TABLE messages (
  id            TEXT PRIMARY KEY,
  villa_id      TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_id     TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  reply_to_id   TEXT REFERENCES messages(id) ON DELETE SET NULL,
  -- Lets a message point at a task/claim/leave request it is about.
  context_type  TEXT CHECK (context_type IN ('task', 'expense_claim', 'leave_request', 'shift')),
  context_id    TEXT,
  edited_at     TEXT,
  deleted_at    TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_messages_channel ON messages(channel_id, created_at);

CREATE TABLE message_mentions (
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, membership_id)
);

CREATE TABLE notifications (
  id            TEXT PRIMARY KEY,
  villa_id      TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  link          TEXT,
  payload       TEXT NOT NULL DEFAULT '{}',
  read_at       TEXT,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at);

-- Append-only. Anything that changes money, access or roster state writes here.
CREATE TABLE audit_log (
  id          TEXT PRIMARY KEY,
  villa_id    TEXT REFERENCES villas(id) ON DELETE CASCADE,
  actor_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  summary     TEXT,
  metadata    TEXT NOT NULL DEFAULT '{}',
  ip          TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX idx_audit_villa ON audit_log(villa_id, created_at);
