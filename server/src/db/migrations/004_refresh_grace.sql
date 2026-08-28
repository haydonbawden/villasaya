-- ---------------------------------------------------------------------------
-- 004_refresh_grace: tolerate concurrent refresh-token rotation
--
-- Two tabs (or one React StrictMode double-render) can present the same refresh
-- token within milliseconds of each other. Treating the second as a replay and
-- revoking the whole family logged people out for doing nothing wrong, so
-- rotation now records its successor and allows a short grace window.
-- ---------------------------------------------------------------------------

ALTER TABLE refresh_tokens ADD COLUMN replaced_by TEXT;
