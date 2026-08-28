import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne } from '../db/index.ts';
import { asyncHandler } from '../auth/middleware.ts';
import { requireAuth, requireVilla } from '../auth/context.ts';
import { parseQuery } from '../lib/validate.ts';

export const notificationsRouter = Router({ mergeParams: true });

// ---------------------------------------------------------------------------
// GET /notifications
// ---------------------------------------------------------------------------
notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const { limit, unreadOnly } = parseQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(30),
        unreadOnly: z.coerce.boolean().default(false),
      }),
      req,
    );

    const rows = query<{
      id: string; kind: string; title: string; body: string | null; link: string | null;
      payload: string; read_at: string | null; created_at: string;
    }>(
      `SELECT id, kind, title, body, link, payload, read_at, created_at
         FROM notifications
        WHERE villa_id = ? AND user_id = ? ${unreadOnly ? 'AND read_at IS NULL' : ''}
        ORDER BY created_at DESC
        LIMIT ?`,
      [villa.villaId, auth.userId, limit],
    );
    const unread = queryOne<{ count: number }>(
      'SELECT COUNT(*) AS count FROM notifications WHERE villa_id = ? AND user_id = ? AND read_at IS NULL',
      [villa.villaId, auth.userId],
    );

    res.json({
      notifications: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        link: row.link,
        payload: JSON.parse(row.payload) as unknown,
        readAt: row.read_at,
        createdAt: row.created_at,
      })),
      unreadCount: unread?.count ?? 0,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /notifications/read
// ---------------------------------------------------------------------------
notificationsRouter.post(
  '/read',
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const body = (req.body ?? {}) as { ids?: unknown };
    const now = new Date().toISOString();

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const ids = body.ids.filter((id): id is string => typeof id === 'string').slice(0, 200);
      if (ids.length > 0) {
        execute(
          `UPDATE notifications SET read_at = ?
            WHERE villa_id = ? AND user_id = ? AND read_at IS NULL
              AND id IN (${ids.map(() => '?').join(', ')})`,
          [now, villa.villaId, auth.userId, ...ids],
        );
      }
    } else {
      // No ids means "mark everything in this villa read".
      execute('UPDATE notifications SET read_at = ? WHERE villa_id = ? AND user_id = ? AND read_at IS NULL', [
        now, villa.villaId, auth.userId,
      ]);
    }
    res.json({ readAt: now });
  }),
);
