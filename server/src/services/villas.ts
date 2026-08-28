import { execute, queryOne, transaction } from '../db/index.ts';
import { newId } from '../lib/ids.ts';
import { conflict } from '../lib/errors.ts';
import { SYSTEM_ROLES } from '../permissions.ts';

export type CreatedVilla = { villaId: string; ownerMembershipId: string; slug: string };

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base.length >= 3 ? base : 'villa';
}

function uniqueSlug(name: string): string {
  const base = slugify(name);
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = queryOne<{ id: string }>('SELECT id FROM villas WHERE slug = ?', [candidate]);
    if (!taken) return candidate;
  }
  return `${base}-${newId().slice(-6)}`;
}

const DEFAULT_TASK_CATEGORIES = [
  { name: 'Housekeeping', colour: '#0ea5e9' },
  { name: 'Pool & Garden', colour: '#10b981' },
  { name: 'Maintenance', colour: '#f97316' },
  { name: 'Guest Services', colour: '#8b5cf6' },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Groceries', colour: '#f59e0b', autoApproveLimitMinor: 500_000 },
  { name: 'Pool Chemicals', colour: '#06b6d4', autoApproveLimitMinor: 1_000_000 },
  { name: 'Maintenance & Repairs', colour: '#ef4444', autoApproveLimitMinor: null },
  { name: 'Transport', colour: '#6366f1', autoApproveLimitMinor: 300_000 },
  { name: 'Guest Supplies', colour: '#ec4899', autoApproveLimitMinor: 500_000 },
];

const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', colour: '#a855f7', isPaid: true, quota: 12 },
  { name: 'Sick Leave', colour: '#ef4444', isPaid: true, quota: 12 },
  { name: 'Religious Holiday', colour: '#14b8a6', isPaid: true, quota: 2 },
  { name: 'Unpaid Leave', colour: '#94a3b8', isPaid: false, quota: null },
];

/**
 * Creates a villa workspace with its system roles, starter categories, leave
 * types, a general channel, and the creating user as owner. Done in one
 * transaction so a half-built workspace can never be observed.
 */
export function createVillaWorkspace(input: {
  name: string;
  ownerUserId: string;
  address?: string | null;
  timezone?: string;
  currency?: string;
}): CreatedVilla {
  const name = input.name.trim();
  if (name.length < 2) throw conflict('Villa name is too short');

  return transaction(() => {
    const now = new Date().toISOString();
    const villaId = newId();
    const slug = uniqueSlug(name);

    execute(
      `INSERT INTO villas (id, name, slug, address, timezone, currency, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        villaId,
        name,
        slug,
        input.address ?? null,
        input.timezone ?? 'Asia/Makassar',
        input.currency ?? 'IDR',
        input.ownerUserId,
        now,
        now,
      ],
    );

    let ownerRoleId = '';
    for (const template of SYSTEM_ROLES) {
      const roleId = newId();
      if (template.isOwner) ownerRoleId = roleId;
      execute(
        `INSERT INTO roles (id, villa_id, key, name, description, colour, permissions, is_system, is_owner, rank, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
        [
          roleId,
          villaId,
          template.key,
          template.name,
          template.description,
          template.colour,
          JSON.stringify(template.permissions),
          template.isOwner ? 1 : 0,
          template.rank,
          now,
          now,
        ],
      );
    }

    const ownerMembershipId = newId();
    execute(
      `INSERT INTO memberships (id, villa_id, user_id, role_id, job_title, employment_type, started_on, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'full_time', ?, 'active', ?, ?)`,
      [ownerMembershipId, villaId, input.ownerUserId, ownerRoleId, 'Owner', now.slice(0, 10), now, now],
    );

    for (const category of DEFAULT_TASK_CATEGORIES) {
      execute('INSERT INTO task_categories (id, villa_id, name, colour, created_at) VALUES (?, ?, ?, ?, ?)', [
        newId(), villaId, category.name, category.colour, now,
      ]);
    }
    for (const category of DEFAULT_EXPENSE_CATEGORIES) {
      execute(
        `INSERT INTO expense_categories (id, villa_id, name, colour, auto_approve_limit_minor, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), villaId, category.name, category.colour, category.autoApproveLimitMinor, now],
      );
    }
    for (const type of DEFAULT_LEAVE_TYPES) {
      execute(
        `INSERT INTO leave_types (id, villa_id, name, colour, is_paid, default_quota_days, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [newId(), villaId, type.name, type.colour, type.isPaid, type.quota, now],
      );
    }

    const channelId = newId();
    execute(
      `INSERT INTO channels (id, villa_id, kind, name, topic, is_private, is_default, created_by, created_at, updated_at)
       VALUES (?, ?, 'channel', 'general', 'Everything about the villa', 0, 1, ?, ?, ?)`,
      [channelId, villaId, input.ownerUserId, now, now],
    );
    execute(
      'INSERT INTO channel_members (channel_id, membership_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [channelId, ownerMembershipId, 'moderator', now],
    );

    return { villaId, ownerMembershipId, slug };
  });
}

/** Adds a member to the villa's default channels. */
export function joinDefaultChannels(villaId: string, membershipId: string): void {
  const now = new Date().toISOString();
  const channels = queryOne<{ ids: string | null }>(
    'SELECT GROUP_CONCAT(id) AS ids FROM channels WHERE villa_id = ? AND is_default = 1 AND archived_at IS NULL',
    [villaId],
  );
  if (!channels?.ids) return;
  for (const channelId of channels.ids.split(',')) {
    execute(
      'INSERT OR IGNORE INTO channel_members (channel_id, membership_id, role, joined_at) VALUES (?, ?, ?, ?)',
      [channelId, membershipId, 'member', now],
    );
  }
}
