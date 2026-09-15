-- 006_villa_features: modules a villa can switch off.
--
-- Leave and expenses are the two modules a small villa asked not to be shown,
-- and a feature nobody uses is not neutral — it is a menu item that has to be
-- explained to every new member of staff. So each module becomes a switch.
--
-- Off means hidden, never deleted: the API answers 404 and every row stays put,
-- so switching a module back on returns the villa to exactly where it was.
--
-- An absent row means "whatever the catalogue says this module defaults to",
-- which is what lets a module added later arrive switched off without a
-- migration of its own. Existing villas are the exception and get explicit
-- rows below: they are already running on leave and expenses, and a migration
-- that quietly took a working module away would be a data loss in all but name.

CREATE TABLE villa_features (
  villa_id   TEXT    NOT NULL REFERENCES villas(id) ON DELETE CASCADE,
  feature    TEXT    NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL,
  updated_by TEXT    REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (villa_id, feature)
);

INSERT INTO villa_features (villa_id, feature, enabled, updated_at, updated_by)
SELECT v.id, f.key, 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL
  FROM villas v
  CROSS JOIN (
    SELECT 'tasks' AS key
    UNION ALL SELECT 'roster'
    UNION ALL SELECT 'leave'
    UNION ALL SELECT 'expenses'
    UNION ALL SELECT 'messages'
  ) f;
