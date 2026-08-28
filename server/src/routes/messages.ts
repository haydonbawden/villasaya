import { Router } from 'express';
import { z } from 'zod';
import { execute, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { can, requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { notify } from '../lib/notify.ts';
import { parseBody, parseQuery } from '../lib/validate.ts';
import { emitToChannel } from '../realtime/hub.ts';

export const messagesRouter = Router({ mergeParams: true });

// Every route here needs at least read access to the villa's conversations.
messagesRouter.use(requirePermission('messages:read'));

type ChannelRow = {
  id: string;
  kind: string;
  name: string | null;
  topic: string | null;
  is_private: number;
  is_default: number;
  direct_key: string | null;
  created_at: string;
};

function membersOf(channelId: string) {
  return query<{ membership_id: string; full_name: string; avatar_colour: string; role: string }>(
    `SELECT cm.membership_id, u.full_name, u.avatar_colour, cm.role
       FROM channel_members cm
       JOIN memberships m ON m.id = cm.membership_id
       JOIN users u ON u.id = m.user_id
      WHERE cm.channel_id = ?
      ORDER BY u.full_name`,
    [channelId],
  );
}

function isMember(channelId: string, membershipId: string): boolean {
  return Boolean(
    queryOne('SELECT 1 AS ok FROM channel_members WHERE channel_id = ? AND membership_id = ?', [channelId, membershipId]),
  );
}

/**
 * Loads a channel the caller may see. Private channels and DMs require
 * membership; public channels are visible to anyone who can read messages.
 */
function loadChannel(villaId: string, channelId: string, membershipId: string, canModerate: boolean): ChannelRow {
  const row = queryOne<ChannelRow>(
    'SELECT id, kind, name, topic, is_private, is_default, direct_key, created_at FROM channels WHERE villa_id = ? AND id = ? AND archived_at IS NULL',
    [villaId, channelId],
  );
  if (!row) throw notFound('Channel not found');
  const restricted = row.is_private === 1 || row.kind === 'direct';
  if (restricted && !isMember(channelId, membershipId)) {
    // A moderator can see a private channel but never a direct message.
    if (!(canModerate && row.kind === 'channel')) throw notFound('Channel not found');
  }
  return row;
}

function serialiseChannel(
  row: ChannelRow,
  extras: { unreadCount: number; lastMessageAt: string | null; members: ReturnType<typeof membersOf>; selfMembershipId: string },
) {
  // A DM is named after the other person rather than carrying a stored name.
  const others = extras.members.filter((member) => member.membership_id !== extras.selfMembershipId);
  const displayName =
    row.kind === 'direct'
      ? others.map((member) => member.full_name).join(', ') || 'Direct message'
      : (row.name ?? 'channel');
  return {
    id: row.id,
    kind: row.kind,
    name: displayName,
    topic: row.topic,
    isPrivate: row.is_private === 1,
    isDefault: row.is_default === 1,
    members: extras.members.map((member) => ({
      membershipId: member.membership_id,
      fullName: member.full_name,
      avatarColour: member.avatar_colour,
      role: member.role,
    })),
    unreadCount: extras.unreadCount,
    lastMessageAt: extras.lastMessageAt,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// GET /messages/channels
// ---------------------------------------------------------------------------
messagesRouter.get(
  '/channels',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const canModerate = can(req, 'messages:moderate');

    const rows = query<ChannelRow & { unread_count: number; last_message_at: string | null }>(
      `SELECT c.id, c.kind, c.name, c.topic, c.is_private, c.is_default, c.direct_key, c.created_at,
              (SELECT MAX(m.created_at) FROM messages m WHERE m.channel_id = c.id AND m.deleted_at IS NULL) AS last_message_at,
              (SELECT COUNT(*) FROM messages m
                WHERE m.channel_id = c.id AND m.deleted_at IS NULL
                  AND m.author_id != ?
                  AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)) AS unread_count
         FROM channels c
         LEFT JOIN channel_members cm ON cm.channel_id = c.id AND cm.membership_id = ?
        WHERE c.villa_id = ? AND c.archived_at IS NULL
          AND (
            cm.membership_id IS NOT NULL
            OR (c.kind = 'channel' AND c.is_private = 0)
            ${canModerate ? "OR c.kind = 'channel'" : ''}
          )
        ORDER BY c.kind, COALESCE(last_message_at, c.created_at) DESC`,
      [villa.membershipId, villa.membershipId, villa.villaId],
    );

    res.json({
      channels: rows.map((row) =>
        serialiseChannel(row, {
          unreadCount: row.unread_count,
          lastMessageAt: row.last_message_at,
          members: membersOf(row.id),
          selfMembershipId: villa.membershipId,
        }),
      ),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /messages/channels
// ---------------------------------------------------------------------------
messagesRouter.post(
  '/channels',
  requirePermission('messages:manage_channels'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9 _-]*$/i, 'Use letters, numbers, spaces, dashes or underscores'),
        topic: z.string().trim().max(200).optional(),
        isPrivate: z.boolean().default(false),
        memberIds: z.array(z.string().trim()).max(100).default([]),
      }),
      req,
    );

    const existing = queryOne('SELECT 1 AS ok FROM channels WHERE villa_id = ? AND kind = ? AND LOWER(name) = LOWER(?)', [
      villa.villaId, 'channel', input.name,
    ]);
    if (existing) throw conflict('A channel with that name already exists');

    const now = new Date().toISOString();
    const channelId = newId();
    transaction(() => {
      execute(
        `INSERT INTO channels (id, villa_id, kind, name, topic, is_private, is_default, created_by, created_at, updated_at)
         VALUES (?, ?, 'channel', ?, ?, ?, 0, ?, ?, ?)`,
        [channelId, villa.villaId, input.name, input.topic ?? null, input.isPrivate, req.auth?.userId ?? '', now, now],
      );
      const members = new Set([villa.membershipId, ...input.memberIds]);
      for (const membershipId of members) {
        const valid = queryOne("SELECT 1 AS ok FROM memberships WHERE id = ? AND villa_id = ? AND status = 'active'", [
          membershipId, villa.villaId,
        ]);
        if (!valid) throw badRequest('One of the people you selected is not an active member of this villa');
        execute('INSERT INTO channel_members (channel_id, membership_id, role, joined_at) VALUES (?, ?, ?, ?)', [
          channelId, membershipId, membershipId === villa.membershipId ? 'moderator' : 'member', now,
        ]);
      }
    });
    auditFromRequest(req, { action: 'channel.created', entityType: 'channel', entityId: channelId, summary: `Channel #${input.name} created` });

    const row = queryOne<ChannelRow>(
      'SELECT id, kind, name, topic, is_private, is_default, direct_key, created_at FROM channels WHERE id = ?',
      [channelId],
    );
    res.status(201).json({
      channel: serialiseChannel(row as ChannelRow, {
        unreadCount: 0,
        lastMessageAt: null,
        members: membersOf(channelId),
        selfMembershipId: villa.membershipId,
      }),
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /messages/direct — find or create a DM with one or more colleagues
// ---------------------------------------------------------------------------
messagesRouter.post(
  '/direct',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({ membershipIds: z.array(z.string().trim()).min(1, 'Choose someone to message').max(9) }),
      req,
    );

    const participants = [...new Set([villa.membershipId, ...input.membershipIds])].sort();
    if (participants.length < 2) throw badRequest('Choose someone other than yourself');
    for (const membershipId of participants) {
      const valid = queryOne("SELECT 1 AS ok FROM memberships WHERE id = ? AND villa_id = ? AND status = 'active'", [
        membershipId, villa.villaId,
      ]);
      if (!valid) throw badRequest('That person is not an active member of this villa');
    }

    // The sorted participant list is the natural key, so re-opening a
    // conversation returns the existing thread instead of a duplicate.
    const directKey = participants.join(',');
    const existing = queryOne<ChannelRow>(
      'SELECT id, kind, name, topic, is_private, is_default, direct_key, created_at FROM channels WHERE villa_id = ? AND direct_key = ?',
      [villa.villaId, directKey],
    );
    if (existing) {
      res.json({
        channel: serialiseChannel(existing, {
          unreadCount: 0,
          lastMessageAt: null,
          members: membersOf(existing.id),
          selfMembershipId: villa.membershipId,
        }),
        created: false,
      });
      return;
    }

    const now = new Date().toISOString();
    const channelId = newId();
    transaction(() => {
      execute(
        `INSERT INTO channels (id, villa_id, kind, name, is_private, is_default, direct_key, created_by, created_at, updated_at)
         VALUES (?, ?, 'direct', NULL, 1, 0, ?, ?, ?, ?)`,
        [channelId, villa.villaId, directKey, req.auth?.userId ?? '', now, now],
      );
      for (const membershipId of participants) {
        execute('INSERT INTO channel_members (channel_id, membership_id, role, joined_at) VALUES (?, ?, ?, ?)', [
          channelId, membershipId, 'member', now,
        ]);
      }
    });

    const row = queryOne<ChannelRow>(
      'SELECT id, kind, name, topic, is_private, is_default, direct_key, created_at FROM channels WHERE id = ?',
      [channelId],
    );
    res.status(201).json({
      channel: serialiseChannel(row as ChannelRow, {
        unreadCount: 0,
        lastMessageAt: null,
        members: membersOf(channelId),
        selfMembershipId: villa.membershipId,
      }),
      created: true,
    });
  }),
);

// ---------------------------------------------------------------------------
// GET /messages/channels/:channelId/messages
// ---------------------------------------------------------------------------
messagesRouter.get(
  '/channels/:channelId/messages',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const channelId = String(req.params.channelId);
    loadChannel(villa.villaId, channelId, villa.membershipId, can(req, 'messages:moderate'));

    const { limit, before } = parseQuery(
      z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
        before: z.string().trim().max(64).optional(),
      }),
      req,
    );

    const rows = query<{
      id: string; body: string; created_at: string; edited_at: string | null; deleted_at: string | null;
      reply_to_id: string | null; context_type: string | null; context_id: string | null;
      author_membership_id: string; author_name: string; avatar_colour: string;
    }>(
      `SELECT m.id, m.body, m.created_at, m.edited_at, m.deleted_at, m.reply_to_id, m.context_type, m.context_id,
              m.author_id AS author_membership_id, u.full_name AS author_name, u.avatar_colour
         FROM messages m
         JOIN memberships mem ON mem.id = m.author_id
         JOIN users u ON u.id = mem.user_id
        WHERE m.channel_id = ? ${before ? 'AND m.id < ?' : ''}
        ORDER BY m.id DESC
        LIMIT ?`,
      before ? [channelId, before, limit + 1] : [channelId, limit + 1],
    );

    const page = rows.slice(0, limit).reverse();
    res.json({
      messages: page.map((row) => ({
        id: row.id,
        body: row.deleted_at ? null : row.body,
        deleted: Boolean(row.deleted_at),
        editedAt: row.edited_at,
        replyToId: row.reply_to_id,
        context: row.context_type ? { type: row.context_type, id: row.context_id } : null,
        author: {
          membershipId: row.author_membership_id,
          fullName: row.author_name,
          avatarColour: row.avatar_colour,
        },
        createdAt: row.created_at,
      })),
      // Older messages are fetched with ?before=<oldest id>.
      hasMore: rows.length > limit,
    });
  }),
);

// ---------------------------------------------------------------------------
// POST /messages/channels/:channelId/messages
// ---------------------------------------------------------------------------
messagesRouter.post(
  '/channels/:channelId/messages',
  requirePermission('messages:send'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const channelId = String(req.params.channelId);
    const channel = loadChannel(villa.villaId, channelId, villa.membershipId, can(req, 'messages:moderate'));
    // Reading a public channel as a moderator is fine; posting means joining.
    if (!isMember(channelId, villa.membershipId)) {
      if (channel.kind === 'direct' || channel.is_private === 1) throw forbidden('You are not in this conversation');
      execute('INSERT OR IGNORE INTO channel_members (channel_id, membership_id, role, joined_at) VALUES (?, ?, ?, ?)', [
        channelId, villa.membershipId, 'member', new Date().toISOString(),
      ]);
    }

    const input = parseBody(
      z.object({
        body: z.string().trim().min(1, 'Write something to send').max(4000),
        replyToId: z.string().trim().nullable().optional(),
        mentions: z.array(z.string().trim()).max(50).default([]),
        context: z
          .object({
            type: z.enum(['task', 'expense_claim', 'leave_request', 'shift']),
            id: z.string().trim(),
          })
          .nullable()
          .optional(),
        attachmentIds: z.array(z.string().trim()).max(5).default([]),
      }),
      req,
    );

    if (input.replyToId) {
      const parent = queryOne('SELECT 1 AS ok FROM messages WHERE id = ? AND channel_id = ?', [input.replyToId, channelId]);
      if (!parent) throw badRequest('The message you are replying to no longer exists');
    }

    // A mention is only honoured for someone who is already in the channel.
    // Without this, naming a non-participant in a private channel or DM would
    // deliver them a notification quoting a message they cannot open.
    const requestedMentions = [...new Set(input.mentions)];
    const mentions = requestedMentions.filter((membershipId) => isMember(channelId, membershipId));

    const now = new Date().toISOString();
    const messageId = newId();
    transaction(() => {
      execute(
        `INSERT INTO messages (id, villa_id, channel_id, author_id, body, reply_to_id, context_type, context_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [messageId, villa.villaId, channelId, villa.membershipId, input.body, input.replyToId ?? null,
         input.context?.type ?? null, input.context?.id ?? null, now],
      );
      for (const membershipId of mentions) {
        execute('INSERT OR IGNORE INTO message_mentions (message_id, membership_id) VALUES (?, ?)', [messageId, membershipId]);
      }
      for (const attachmentId of new Set(input.attachmentIds)) {
        const owned = queryOne('SELECT 1 AS ok FROM attachments WHERE id = ? AND villa_id = ?', [attachmentId, villa.villaId]);
        if (!owned) throw badRequest('One of the attachments could not be found');
        execute(
          "INSERT OR IGNORE INTO attachment_links (attachment_id, entity_type, entity_id, created_at) VALUES (?, 'message', ?, ?)",
          [attachmentId, messageId, now],
        );
      }
      // Sending is an implicit read of everything before it.
      execute('UPDATE channel_members SET last_read_at = ? WHERE channel_id = ? AND membership_id = ?', [
        now, channelId, villa.membershipId,
      ]);
    });

    const payload = {
      id: messageId,
      channelId,
      body: input.body,
      replyToId: input.replyToId ?? null,
      context: input.context ?? null,
      author: { membershipId: villa.membershipId, fullName: req.auth?.fullName ?? '' },
      createdAt: now,
    };
    emitToChannel(villa.villaId, channelId, {
      type: 'message.created',
      villaId: villa.villaId,
      channelId,
      payload,
    });

    // Only mentions raise a notification; a busy channel should not fill the
    // bell for everyone in it.
    if (mentions.length > 0) {
      notify({
        villaId: villa.villaId,
        membershipIds: mentions,
        actorMembershipId: villa.membershipId,
        kind: 'message.mention',
        title: `${req.auth?.fullName ?? 'Someone'} mentioned you`,
        body: input.body.slice(0, 140),
        link: `/villas/${villa.villaId}/messages/${channelId}`,
        payload: { channelId, messageId },
      });
    }
    res.status(201).json({ message: payload });
  }),
);

// ---------------------------------------------------------------------------
// POST /messages/channels/:channelId/read
// ---------------------------------------------------------------------------
messagesRouter.post(
  '/channels/:channelId/read',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const channelId = String(req.params.channelId);
    loadChannel(villa.villaId, channelId, villa.membershipId, can(req, 'messages:moderate'));
    const now = new Date().toISOString();
    execute(
      `INSERT INTO channel_members (channel_id, membership_id, role, last_read_at, joined_at)
       VALUES (?, ?, 'member', ?, ?)
       ON CONFLICT (channel_id, membership_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
      [channelId, villa.membershipId, now, now],
    );
    res.json({ lastReadAt: now });
  }),
);

// ---------------------------------------------------------------------------
// PATCH / DELETE a message
// ---------------------------------------------------------------------------
messagesRouter.patch(
  '/channels/:channelId/messages/:messageId',
  requirePermission('messages:send'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const channelId = String(req.params.channelId);
    const messageId = String(req.params.messageId);
    const message = queryOne<{ id: string; author_id: string; deleted_at: string | null }>(
      'SELECT id, author_id, deleted_at FROM messages WHERE id = ? AND channel_id = ? AND villa_id = ?',
      [messageId, channelId, villa.villaId],
    );
    if (!message) throw notFound('Message not found');
    if (message.deleted_at) throw conflict('That message has been deleted');
    if (message.author_id !== villa.membershipId) throw forbidden('You can only edit your own messages');

    const input = parseBody(z.object({ body: z.string().trim().min(1).max(4000) }), req);
    const now = new Date().toISOString();
    execute('UPDATE messages SET body = ?, edited_at = ? WHERE id = ?', [input.body, now, messageId]);
    emitToChannel(villa.villaId, channelId, {
      type: 'message.updated',
      villaId: villa.villaId,
      channelId,
      payload: { id: messageId, body: input.body, editedAt: now },
    });
    res.json({ id: messageId, body: input.body, editedAt: now });
  }),
);

messagesRouter.delete(
  '/channels/:channelId/messages/:messageId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const channelId = String(req.params.channelId);
    const messageId = String(req.params.messageId);
    const message = queryOne<{ id: string; author_id: string }>(
      'SELECT id, author_id FROM messages WHERE id = ? AND channel_id = ? AND villa_id = ?',
      [messageId, channelId, villa.villaId],
    );
    if (!message) throw notFound('Message not found');

    const isAuthor = message.author_id === villa.membershipId;
    if (!isAuthor && !can(req, 'messages:moderate')) throw forbidden('You cannot delete this message');

    // Soft delete: replies referencing it stay coherent and moderation stays
    // auditable.
    const now = new Date().toISOString();
    execute("UPDATE messages SET deleted_at = ?, body = '' WHERE id = ?", [now, messageId]);
    if (!isAuthor) {
      auditFromRequest(req, {
        action: 'message.moderated',
        entityType: 'message',
        entityId: messageId,
        summary: 'A message was removed by a moderator',
      });
    }
    emitToChannel(villa.villaId, channelId, {
      type: 'message.deleted',
      villaId: villa.villaId,
      channelId,
      payload: { id: messageId },
    });
    res.status(204).end();
  }),
);
