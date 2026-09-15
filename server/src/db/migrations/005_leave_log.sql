-- 005_leave_log: leave stops being an entitlement and becomes a record.
--
-- Quotas were payroll-adjacent, and the app is not a payroll system. They were
-- also the source of a defect worth naming: two fields claimed to set a
-- person's annual leave, `leave_allowances.quota_days` and
-- `memberships.annual_leave_days`, and only the first was ever read. Editing
-- the second saved successfully and changed nothing.
--
-- Deleting the concept removes the contradiction rather than repairing it.
-- What remains is what a villa manager actually wanted: a record of leave
-- taken, filterable, with a total.

DROP TABLE IF EXISTS leave_allowances;

ALTER TABLE leave_types DROP COLUMN default_quota_days;

ALTER TABLE memberships DROP COLUMN annual_leave_days;
