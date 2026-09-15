import { execute, query } from '../db/index.ts';
import { FEATURES, defaultFeatureSet, isFeatureKey, type FeatureKey } from '../features.ts';

/**
 * Enabled modules for one villa.
 *
 * A stored row wins; a missing one falls back to the catalogue default. That
 * fallback is what lets a module be added to `FEATURES` later and arrive
 * switched off everywhere, without a migration to write a row per villa.
 */
export function loadFeatures(villaId: string): Set<FeatureKey> {
  const enabled = defaultFeatureSet();
  const rows = query<{ feature: string; enabled: number }>(
    'SELECT feature, enabled FROM villa_features WHERE villa_id = ?',
    [villaId],
  );
  for (const row of rows) {
    if (!isFeatureKey(row.feature)) continue;
    if (row.enabled === 1) enabled.add(row.feature);
    else enabled.delete(row.feature);
  }
  return enabled;
}

/** Writes the starting set for a new villa. Caller supplies the transaction. */
export function seedFeatures(villaId: string, now: string): void {
  for (const feature of FEATURES) {
    execute(
      `INSERT INTO villa_features (villa_id, feature, enabled, updated_at, updated_by)
       VALUES (?, ?, ?, ?, NULL)`,
      [villaId, feature.key, feature.defaultEnabled ? 1 : 0, now],
    );
  }
}

/**
 * Applies a partial map of module switches and returns the resulting set.
 * Modules the caller did not mention are left exactly as they are.
 */
export function setFeatures(
  villaId: string,
  changes: Partial<Record<FeatureKey, boolean>>,
  actorUserId: string,
): Set<FeatureKey> {
  const now = new Date().toISOString();
  for (const [key, enabled] of Object.entries(changes)) {
    if (!isFeatureKey(key) || enabled === undefined) continue;
    execute(
      `INSERT INTO villa_features (villa_id, feature, enabled, updated_at, updated_by)
            VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (villa_id, feature)
       DO UPDATE SET enabled = excluded.enabled,
                     updated_at = excluded.updated_at,
                     updated_by = excluded.updated_by`,
      [villaId, key, enabled ? 1 : 0, now, actorUserId],
    );
  }
  return loadFeatures(villaId);
}
