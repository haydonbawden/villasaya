import type { Request } from 'express';
import { execute } from '../db/index.ts';
import { newId } from './ids.ts';

export type AuditEntry = {
  villaId: string | null;
  actorId: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Append-only record of anything that moves money, changes access or alters the
 * roster. Deliberately never throws: losing an audit row must not fail the
 * operation it describes, but it should be loud in the logs.
 */
export function recordAudit(entry: AuditEntry): void {
  try {
    execute(
      `INSERT INTO audit_log (id, villa_id, actor_id, action, entity_type, entity_id, summary, metadata, ip, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        entry.villaId,
        entry.actorId,
        entry.action,
        entry.entityType ?? null,
        entry.entityId ?? null,
        entry.summary ?? null,
        JSON.stringify(entry.metadata ?? {}),
        entry.ip ?? null,
        new Date().toISOString(),
      ],
    );
  } catch (error) {
    console.error('[audit] failed to record entry', entry.action, error);
  }
}

export function auditFromRequest(
  req: Request,
  entry: Omit<AuditEntry, 'villaId' | 'actorId' | 'ip'> & { villaId?: string | null },
): void {
  recordAudit({
    villaId: entry.villaId ?? req.villa?.villaId ?? null,
    actorId: req.auth?.userId ?? null,
    ip: req.ip ?? null,
    ...entry,
  });
}
