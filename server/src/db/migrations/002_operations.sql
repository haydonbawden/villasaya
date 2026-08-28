-- ---------------------------------------------------------------------------
-- 002_operations: task allocation, roster, leave and expense claims
-- ---------------------------------------------------------------------------

CREATE TABLE task_categories (
  id         TEXT PRIMARY KEY,
  villa_id   TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  colour     TEXT NOT NULL DEFAULT '#0ea5e9',
  created_at TEXT NOT NULL,
  UNIQUE (villa_id, name)
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,
  villa_id      TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  reference     INTEGER NOT NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  category_id   TEXT REFERENCES task_categories(id) ON DELETE SET NULL,
  location      TEXT,
  priority      TEXT NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status        TEXT NOT NULL DEFAULT 'todo'
                CHECK (status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  due_at        TEXT,
  -- ISO-8601-ish recurrence handled in application code: daily | weekly:1,3,5 |
  -- monthly:15. NULL for one-off tasks.
  recurrence    TEXT,
  recurrence_parent_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
  created_by    TEXT NOT NULL REFERENCES users(id),
  completed_by  TEXT REFERENCES users(id),
  completed_at  TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  UNIQUE (villa_id, reference)
);
CREATE INDEX idx_tasks_villa_status ON tasks(villa_id, status, due_at);

CREATE TABLE task_assignees (
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  assigned_at   TEXT NOT NULL,
  assigned_by   TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (task_id, membership_id)
);
CREATE INDEX idx_task_assignees_membership ON task_assignees(membership_id);

CREATE TABLE task_checklist_items (
  id           TEXT PRIMARY KEY,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  is_done      INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_checklist_task ON task_checklist_items(task_id, position);

CREATE TABLE task_comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  TEXT NOT NULL REFERENCES users(id),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);

-- Roster. A shift with membership_id NULL is an open shift staff can claim.
CREATE TABLE shifts (
  id            TEXT PRIMARY KEY,
  villa_id      TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  membership_id TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  title         TEXT NOT NULL DEFAULT 'Shift',
  starts_at     TEXT NOT NULL,
  ends_at       TEXT NOT NULL,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  location      TEXT,
  notes         TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'cancelled')),
  published_at  TEXT,
  created_by    TEXT NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  CHECK (ends_at > starts_at)
);
CREATE INDEX idx_shifts_villa_window ON shifts(villa_id, starts_at, ends_at);
CREATE INDEX idx_shifts_membership ON shifts(membership_id, starts_at);

CREATE TABLE shift_swap_requests (
  id                TEXT PRIMARY KEY,
  villa_id          TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  shift_id          TEXT NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  requested_by      TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  requested_to      TEXT REFERENCES memberships(id) ON DELETE SET NULL,
  reason            TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'declined', 'approved', 'rejected', 'cancelled')),
  decided_by        TEXT REFERENCES users(id),
  decided_at        TEXT,
  decision_note     TEXT,
  created_at        TEXT NOT NULL
);
CREATE INDEX idx_swaps_villa ON shift_swap_requests(villa_id, status);

CREATE TABLE leave_types (
  id                TEXT PRIMARY KEY,
  villa_id          TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  colour            TEXT NOT NULL DEFAULT '#a855f7',
  is_paid           INTEGER NOT NULL DEFAULT 1 CHECK (is_paid IN (0, 1)),
  -- NULL means unlimited / not tracked against a quota.
  default_quota_days REAL,
  requires_approval INTEGER NOT NULL DEFAULT 1 CHECK (requires_approval IN (0, 1)),
  is_archived       INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at        TEXT NOT NULL,
  UNIQUE (villa_id, name)
);

CREATE TABLE leave_requests (
  id             TEXT PRIMARY KEY,
  villa_id       TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  membership_id  TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  leave_type_id  TEXT NOT NULL REFERENCES leave_types(id),
  start_date     TEXT NOT NULL,
  end_date       TEXT NOT NULL,
  -- Half days let staff take a morning or afternoon off without a whole day.
  start_half_day INTEGER NOT NULL DEFAULT 0 CHECK (start_half_day IN (0, 1)),
  end_half_day   INTEGER NOT NULL DEFAULT 0 CHECK (end_half_day IN (0, 1)),
  total_days     REAL NOT NULL,
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by     TEXT REFERENCES users(id),
  decided_at     TEXT,
  decision_note  TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK (end_date >= start_date)
);
CREATE INDEX idx_leave_villa_status ON leave_requests(villa_id, status, start_date);
CREATE INDEX idx_leave_membership ON leave_requests(membership_id, start_date);

-- Per-member, per-type, per-year quota. Absent rows fall back to the leave
-- type's default_quota_days.
CREATE TABLE leave_allowances (
  id            TEXT PRIMARY KEY,
  villa_id      TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  membership_id TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  leave_type_id TEXT NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  quota_days    REAL NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE (membership_id, leave_type_id, year)
);

CREATE TABLE expense_categories (
  id         TEXT PRIMARY KEY,
  villa_id   TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  colour     TEXT NOT NULL DEFAULT '#f59e0b',
  -- Claims at or below this amount skip approval and land as approved.
  auto_approve_limit_minor INTEGER,
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (villa_id, name)
);

-- Amounts are integer minor units (IDR has no subunit in practice, so 1 rupiah
-- = 1 minor unit) to keep money out of floating point.
CREATE TABLE expense_claims (
  id             TEXT PRIMARY KEY,
  villa_id       TEXT NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  reference      INTEGER NOT NULL,
  membership_id  TEXT NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  category_id    TEXT REFERENCES expense_categories(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  description    TEXT,
  amount_minor   INTEGER NOT NULL CHECK (amount_minor > 0),
  currency       TEXT NOT NULL DEFAULT 'IDR',
  spent_on       TEXT NOT NULL,
  merchant       TEXT,
  payment_method TEXT NOT NULL DEFAULT 'own_funds'
                 CHECK (payment_method IN ('own_funds', 'villa_cash', 'villa_card')),
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'reimbursed', 'cancelled')),
  submitted_at   TEXT,
  decided_by     TEXT REFERENCES users(id),
  decided_at     TEXT,
  decision_note  TEXT,
  reimbursed_at  TEXT,
  reimbursed_by  TEXT REFERENCES users(id),
  reimbursement_reference TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  UNIQUE (villa_id, reference)
);
CREATE INDEX idx_claims_villa_status ON expense_claims(villa_id, status, spent_on);
CREATE INDEX idx_claims_membership ON expense_claims(membership_id, spent_on);
