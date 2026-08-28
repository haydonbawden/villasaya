import { Router } from 'express';
import { z } from 'zod';
import { execute, nextReference, query, queryOne, transaction } from '../db/index.ts';
import { asyncHandler, requirePermission } from '../auth/middleware.ts';
import { accessScope, can, requireAuth, requireVilla } from '../auth/context.ts';
import { auditFromRequest } from '../lib/audit.ts';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.ts';
import { newId } from '../lib/ids.ts';
import { membershipsWithPermission, notify } from '../lib/notify.ts';
import { colourSchema, isoDateSchema, parseBody, parseQuery } from '../lib/validate.ts';
import { emitToVilla } from '../realtime/hub.ts';

export const expensesRouter = Router({ mergeParams: true });

type ClaimRow = {
  id: string;
  reference: number;
  membership_id: string;
  staff_name: string;
  avatar_colour: string;
  category_id: string | null;
  category_name: string | null;
  category_colour: string | null;
  title: string;
  description: string | null;
  amount_minor: number;
  currency: string;
  spent_on: string;
  merchant: string | null;
  payment_method: string;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  decider_name: string | null;
  decision_note: string | null;
  reimbursed_at: string | null;
  reimbursement_reference: string | null;
  created_at: string;
};

const CLAIM_SELECT = `
  SELECT ec.id, ec.reference, ec.membership_id, u.full_name AS staff_name, u.avatar_colour,
         ec.category_id, cat.name AS category_name, cat.colour AS category_colour,
         ec.title, ec.description, ec.amount_minor, ec.currency, ec.spent_on, ec.merchant,
         ec.payment_method, ec.status, ec.submitted_at, ec.decided_at, ec.decision_note,
         ec.reimbursed_at, ec.reimbursement_reference, ec.created_at,
         du.full_name AS decider_name
    FROM expense_claims ec
    JOIN memberships m ON m.id = ec.membership_id
    JOIN users u ON u.id = m.user_id
    LEFT JOIN expense_categories cat ON cat.id = ec.category_id
    LEFT JOIN users du ON du.id = ec.decided_by`;

function receiptsFor(claimIds: string[]): Map<string, Array<{ id: string; filename: string; mimeType: string; byteSize: number }>> {
  const map = new Map<string, Array<{ id: string; filename: string; mimeType: string; byteSize: number }>>();
  if (claimIds.length === 0) return map;
  const placeholders = claimIds.map(() => '?').join(', ');
  const rows = query<{ entity_id: string; id: string; filename: string; mime_type: string; byte_size: number }>(
    `SELECT al.entity_id, a.id, a.filename, a.mime_type, a.byte_size
       FROM attachment_links al
       JOIN attachments a ON a.id = al.attachment_id
      WHERE al.entity_type = 'expense_claim' AND al.entity_id IN (${placeholders})`,
    claimIds,
  );
  for (const row of rows) {
    const list = map.get(row.entity_id) ?? [];
    list.push({ id: row.id, filename: row.filename, mimeType: row.mime_type, byteSize: row.byte_size });
    map.set(row.entity_id, list);
  }
  return map;
}

function serialise(row: ClaimRow, receipts: Array<{ id: string; filename: string; mimeType: string; byteSize: number }>) {
  return {
    id: row.id,
    reference: `CLAIM-${row.reference}`,
    membershipId: row.membership_id,
    staffName: row.staff_name,
    avatarColour: row.avatar_colour,
    category: row.category_id ? { id: row.category_id, name: row.category_name, colour: row.category_colour } : null,
    title: row.title,
    description: row.description,
    amountMinor: row.amount_minor,
    currency: row.currency,
    spentOn: row.spent_on,
    merchant: row.merchant,
    paymentMethod: row.payment_method,
    status: row.status,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decidedBy: row.decider_name,
    decisionNote: row.decision_note,
    reimbursedAt: row.reimbursed_at,
    reimbursementReference: row.reimbursement_reference,
    receipts,
    createdAt: row.created_at,
  };
}

function loadClaim(villaId: string, claimId: string): ClaimRow {
  const row = queryOne<ClaimRow>(`${CLAIM_SELECT} WHERE ec.villa_id = ? AND ec.id = ?`, [villaId, claimId]);
  if (!row) throw notFound('Expense claim not found');
  return row;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
expensesRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const rows = query<{ id: string; name: string; colour: string; auto_approve_limit_minor: number | null }>(
      'SELECT id, name, colour, auto_approve_limit_minor FROM expense_categories WHERE villa_id = ? AND is_archived = 0 ORDER BY name',
      [villa.villaId],
    );
    res.json({
      categories: rows.map((row) => ({
        id: row.id,
        name: row.name,
        colour: row.colour,
        autoApproveLimitMinor: row.auto_approve_limit_minor,
      })),
    });
  }),
);

expensesRouter.post(
  '/categories',
  requirePermission('expenses:manage_categories'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60),
        colour: colourSchema.default('#f59e0b'),
        autoApproveLimitMinor: z.number().int().min(0).nullable().optional(),
      }),
      req,
    );
    const id = newId();
    execute(
      `INSERT INTO expense_categories (id, villa_id, name, colour, auto_approve_limit_minor, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, villa.villaId, input.name, input.colour, input.autoApproveLimitMinor ?? null, new Date().toISOString()],
    );
    auditFromRequest(req, { action: 'expense_category.created', entityType: 'expense_category', entityId: id, summary: `Category "${input.name}" created` });
    res.status(201).json({ category: { id, ...input } });
  }),
);

expensesRouter.patch(
  '/categories/:categoryId',
  requirePermission('expenses:manage_categories'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(
      z.object({
        name: z.string().trim().min(2).max(60).optional(),
        colour: colourSchema.optional(),
        autoApproveLimitMinor: z.number().int().min(0).nullable().optional(),
        isArchived: z.boolean().optional(),
      }),
      req,
    );
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => { updates.push(`${column} = ?`); params.push(value); };
    if (input.name !== undefined) set('name', input.name);
    if (input.colour !== undefined) set('colour', input.colour);
    if (input.autoApproveLimitMinor !== undefined) set('auto_approve_limit_minor', input.autoApproveLimitMinor);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);
    if (updates.length === 0) { res.json({ updated: false }); return; }
    const changed = execute(`UPDATE expense_categories SET ${updates.join(', ')} WHERE id = ? AND villa_id = ?`, [
      ...params, String(req.params.categoryId), villa.villaId,
    ]);
    if (changed.changes === 0) throw notFound('Category not found');
    res.json({ updated: true });
  }),
);

// ---------------------------------------------------------------------------
// GET /expenses
// ---------------------------------------------------------------------------
expensesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const scope = accessScope(req, 'expenses');
    if (scope === 'none') throw forbidden('You do not have permission to view expense claims');

    const filters = parseQuery(
      z.object({
        status: z.string().trim().optional(),
        membershipId: z.string().trim().optional(),
        categoryId: z.string().trim().optional(),
        from: z.string().trim().optional(),
        to: z.string().trim().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(100),
      }),
      req,
    );

    const where: string[] = ['ec.villa_id = ?'];
    const params: (string | number)[] = [villa.villaId];
    if (scope === 'own') {
      where.push('ec.membership_id = ?');
      params.push(villa.membershipId);
    } else if (filters.membershipId) {
      where.push('ec.membership_id = ?');
      params.push(filters.membershipId);
    }
    if (filters.status) {
      const statuses = filters.status.split(',').map((s) => s.trim()).filter(Boolean);
      if (statuses.length > 0) {
        where.push(`ec.status IN (${statuses.map(() => '?').join(', ')})`);
        params.push(...statuses);
      }
    }
    if (filters.categoryId) { where.push('ec.category_id = ?'); params.push(filters.categoryId); }
    if (filters.from) { where.push('ec.spent_on >= ?'); params.push(filters.from); }
    if (filters.to) { where.push('ec.spent_on <= ?'); params.push(filters.to); }

    const rows = query<ClaimRow>(
      `${CLAIM_SELECT} WHERE ${where.join(' AND ')} ORDER BY ec.spent_on DESC, ec.reference DESC LIMIT ?`,
      [...params, filters.limit],
    );
    const receipts = receiptsFor(rows.map((row) => row.id));
    const totals = rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] ?? 0) + row.amount_minor;
      return acc;
    }, {});
    res.json({
      claims: rows.map((row) => serialise(row, receipts.get(row.id) ?? [])),
      totalsByStatusMinor: totals,
      currency: villa.currency,
    });
  }),
);

expensesRouter.get(
  '/:claimId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const scope = accessScope(req, 'expenses');
    if (scope === 'none') throw forbidden('You do not have permission to view expense claims');
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    if (scope === 'own' && claim.membership_id !== villa.membershipId) throw notFound('Expense claim not found');
    res.json({ claim: serialise(claim, receiptsFor([claim.id]).get(claim.id) ?? []) });
  }),
);

// ---------------------------------------------------------------------------
// POST /expenses
// ---------------------------------------------------------------------------
const claimSchema = z.object({
  title: z.string().trim().min(2, 'Describe what the money was spent on').max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  categoryId: z.string().trim().nullable().optional(),
  amountMinor: z.number().int().positive('Enter an amount greater than zero'),
  spentOn: isoDateSchema,
  merchant: z.string().trim().max(120).nullable().optional(),
  paymentMethod: z.enum(['own_funds', 'villa_cash', 'villa_card']).default('own_funds'),
  attachmentIds: z.array(z.string().trim()).max(10).default([]),
  /** Submit immediately rather than saving a draft. */
  submit: z.boolean().default(true),
});

expensesRouter.post(
  '/',
  requirePermission('expenses:submit'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const input = parseBody(claimSchema, req);

    if (Date.parse(`${input.spentOn}T00:00:00Z`) > Date.now() + 86_400_000) {
      throw badRequest('The date of spending cannot be in the future', { spentOn: 'Pick a date on or before today' });
    }
    let autoApproveLimit: number | null = null;
    if (input.categoryId) {
      const category = queryOne<{ id: string; auto_approve_limit_minor: number | null }>(
        'SELECT id, auto_approve_limit_minor FROM expense_categories WHERE id = ? AND villa_id = ? AND is_archived = 0',
        [input.categoryId, villa.villaId],
      );
      if (!category) throw badRequest('That expense category does not exist');
      autoApproveLimit = category.auto_approve_limit_minor;
    }
    assertAttachmentsOwned(villa.villaId, input.attachmentIds);

    // Small, in-category spending clears itself so a manager is not approving
    // every bag of groceries.
    const autoApproved =
      input.submit && autoApproveLimit !== null && input.amountMinor <= autoApproveLimit;
    const status = !input.submit ? 'draft' : autoApproved ? 'approved' : 'submitted';

    const now = new Date().toISOString();
    const claimId = newId();
    transaction(() => {
      const reference = nextReference('expense_claims', villa.villaId);
      execute(
        `INSERT INTO expense_claims (id, villa_id, reference, membership_id, category_id, title, description,
                                     amount_minor, currency, spent_on, merchant, payment_method, status,
                                     submitted_at, decided_at, decision_note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [claimId, villa.villaId, reference, villa.membershipId, input.categoryId ?? null, input.title,
         input.description ?? null, input.amountMinor, villa.currency, input.spentOn, input.merchant ?? null,
         input.paymentMethod, status, input.submit ? now : null, autoApproved ? now : null,
         autoApproved ? 'Automatically approved: within the category limit' : null, now, now],
      );
      for (const attachmentId of new Set(input.attachmentIds)) {
        execute(
          "INSERT OR IGNORE INTO attachment_links (attachment_id, entity_type, entity_id, created_at) VALUES (?, 'expense_claim', ?, ?)",
          [attachmentId, claimId, now],
        );
      }
    });

    if (status === 'submitted') {
      notify({
        villaId: villa.villaId,
        membershipIds: membershipsWithPermission(villa.villaId, 'expenses:approve'),
        actorMembershipId: villa.membershipId,
        kind: 'expense.submitted',
        title: 'Expense claim needs approval',
        body: `${input.title} — ${formatMinor(input.amountMinor, villa.currency)}`,
        link: `/villas/${villa.villaId}/expenses/${claimId}`,
        payload: { claimId },
      });
    }
    auditFromRequest(req, {
      action: 'expense.created',
      entityType: 'expense_claim',
      entityId: claimId,
      summary: `Claim "${input.title}" for ${formatMinor(input.amountMinor, villa.currency)} (${status})`,
      metadata: { amountMinor: input.amountMinor, status },
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'expenses' } });

    const claim = loadClaim(villa.villaId, claimId);
    res.status(201).json({ claim: serialise(claim, receiptsFor([claimId]).get(claimId) ?? []) });
  }),
);

function assertAttachmentsOwned(villaId: string, attachmentIds: string[]): void {
  for (const attachmentId of new Set(attachmentIds)) {
    const exists = queryOne('SELECT 1 AS ok FROM attachments WHERE id = ? AND villa_id = ?', [attachmentId, villaId]);
    if (!exists) throw badRequest('One of the receipts could not be found');
  }
}

function formatMinor(amountMinor: number, currency: string): string {
  // IDR is quoted in whole rupiah; other currencies here use two decimals.
  const value = currency === 'IDR' ? amountMinor : amountMinor / 100;
  return `${currency} ${value.toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// PATCH /expenses/:claimId — the claimant may edit while it is still theirs
// ---------------------------------------------------------------------------
expensesRouter.patch(
  '/:claimId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    const isOwn = claim.membership_id === villa.membershipId;
    if (!isOwn && !can(req, 'expenses:approve')) throw forbidden('You cannot edit this claim');
    if (claim.status !== 'draft' && claim.status !== 'submitted') {
      throw conflict('A claim that has been decided can no longer be edited');
    }
    // Once submitted it is in someone else's queue, so only the claimant
    // withdrawing it (below) or an approver may change it.
    if (claim.status === 'submitted' && isOwn && !can(req, 'expenses:approve')) {
      throw conflict('Withdraw the claim before editing it');
    }

    const input = parseBody(claimSchema.partial().omit({ submit: true }), req);
    if (input.categoryId) {
      const category = queryOne('SELECT 1 AS ok FROM expense_categories WHERE id = ? AND villa_id = ?', [
        input.categoryId, villa.villaId,
      ]);
      if (!category) throw badRequest('That expense category does not exist');
    }
    if (input.attachmentIds) assertAttachmentsOwned(villa.villaId, input.attachmentIds);

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: (string | number | null)[] = [];
    const set = (column: string, value: string | number | null) => { updates.push(`${column} = ?`); params.push(value); };
    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.categoryId !== undefined) set('category_id', input.categoryId);
    if (input.amountMinor !== undefined) set('amount_minor', input.amountMinor);
    if (input.spentOn !== undefined) set('spent_on', input.spentOn);
    if (input.merchant !== undefined) set('merchant', input.merchant);
    if (input.paymentMethod !== undefined) set('payment_method', input.paymentMethod);

    transaction(() => {
      if (updates.length > 0) {
        set('updated_at', now);
        execute(`UPDATE expense_claims SET ${updates.join(', ')} WHERE id = ?`, [...params, claim.id]);
      }
      if (input.attachmentIds !== undefined) {
        execute("DELETE FROM attachment_links WHERE entity_type = 'expense_claim' AND entity_id = ?", [claim.id]);
        for (const attachmentId of new Set(input.attachmentIds)) {
          execute(
            "INSERT INTO attachment_links (attachment_id, entity_type, entity_id, created_at) VALUES (?, 'expense_claim', ?, ?)",
            [attachmentId, claim.id, now],
          );
        }
      }
    });
    auditFromRequest(req, { action: 'expense.updated', entityType: 'expense_claim', entityId: claim.id });
    const updated = loadClaim(villa.villaId, claim.id);
    res.json({ claim: serialise(updated, receiptsFor([claim.id]).get(claim.id) ?? []) });
  }),
);

// ---------------------------------------------------------------------------
// POST /expenses/:claimId/submit and /withdraw
// ---------------------------------------------------------------------------
expensesRouter.post(
  '/:claimId/submit',
  requirePermission('expenses:submit'),
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    if (claim.membership_id !== villa.membershipId) throw forbidden('You can only submit your own claims');
    if (claim.status !== 'draft') throw conflict('That claim has already been submitted');

    const now = new Date().toISOString();
    execute("UPDATE expense_claims SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?", [
      now, now, claim.id,
    ]);
    notify({
      villaId: villa.villaId,
      membershipIds: membershipsWithPermission(villa.villaId, 'expenses:approve'),
      actorMembershipId: villa.membershipId,
      kind: 'expense.submitted',
      title: 'Expense claim needs approval',
      body: `${claim.title} — ${formatMinor(claim.amount_minor, claim.currency)}`,
      link: `/villas/${villa.villaId}/expenses/${claim.id}`,
      payload: { claimId: claim.id },
    });
    auditFromRequest(req, { action: 'expense.submitted', entityType: 'expense_claim', entityId: claim.id });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'expenses' } });
    res.json({ status: 'submitted' });
  }),
);

expensesRouter.post(
  '/:claimId/withdraw',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    if (claim.membership_id !== villa.membershipId) throw forbidden('You can only withdraw your own claims');
    if (claim.status !== 'submitted') throw conflict('Only a submitted claim can be withdrawn');
    execute("UPDATE expense_claims SET status = 'draft', submitted_at = NULL, updated_at = ? WHERE id = ?", [
      new Date().toISOString(), claim.id,
    ]);
    auditFromRequest(req, { action: 'expense.withdrawn', entityType: 'expense_claim', entityId: claim.id });
    res.json({ status: 'draft' });
  }),
);

// ---------------------------------------------------------------------------
// POST /expenses/:claimId/decision
// ---------------------------------------------------------------------------
expensesRouter.post(
  '/:claimId/decision',
  requirePermission('expenses:approve'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    if (claim.status !== 'submitted') throw conflict('Only a submitted claim can be approved or rejected');
    // Self-approval is the classic expense-fraud path, so it is blocked even
    // for someone who legitimately holds the approve permission.
    if (claim.membership_id === villa.membershipId) throw forbidden('You cannot approve your own claim');

    const input = parseBody(
      z.object({ decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(500).optional() }),
      req,
    );
    if (input.decision === 'rejected' && !input.note) {
      throw badRequest('Explain why the claim was rejected', { note: 'A short reason is required' });
    }

    const now = new Date().toISOString();
    execute(
      'UPDATE expense_claims SET status = ?, decided_by = ?, decided_at = ?, decision_note = ?, updated_at = ? WHERE id = ?',
      [input.decision, auth.userId, now, input.note ?? null, now, claim.id],
    );
    notify({
      villaId: villa.villaId,
      membershipIds: [claim.membership_id],
      actorMembershipId: villa.membershipId,
      kind: `expense.${input.decision}`,
      title: input.decision === 'approved' ? 'Expense claim approved' : 'Expense claim declined',
      body: `${claim.title} — ${formatMinor(claim.amount_minor, claim.currency)}`,
      link: `/villas/${villa.villaId}/expenses/${claim.id}`,
      payload: { claimId: claim.id },
    });
    auditFromRequest(req, {
      action: `expense.${input.decision}`,
      entityType: 'expense_claim',
      entityId: claim.id,
      summary: `${claim.staff_name}'s claim for ${formatMinor(claim.amount_minor, claim.currency)} was ${input.decision}`,
      metadata: { amountMinor: claim.amount_minor },
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'expenses' } });
    res.json({ status: input.decision });
  }),
);

// ---------------------------------------------------------------------------
// POST /expenses/:claimId/reimburse
// ---------------------------------------------------------------------------
expensesRouter.post(
  '/:claimId/reimburse',
  requirePermission('expenses:reimburse'),
  asyncHandler(async (req, res) => {
    const auth = requireAuth(req);
    const villa = requireVilla(req);
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    if (claim.status !== 'approved') throw conflict('Only an approved claim can be marked as reimbursed');

    const input = parseBody(z.object({ reference: z.string().trim().max(100).optional() }), req);
    const now = new Date().toISOString();
    execute(
      `UPDATE expense_claims SET status = 'reimbursed', reimbursed_at = ?, reimbursed_by = ?,
              reimbursement_reference = ?, updated_at = ? WHERE id = ?`,
      [now, auth.userId, input.reference ?? null, now, claim.id],
    );
    notify({
      villaId: villa.villaId,
      membershipIds: [claim.membership_id],
      actorMembershipId: villa.membershipId,
      kind: 'expense.reimbursed',
      title: 'Expense reimbursed',
      body: `${claim.title} — ${formatMinor(claim.amount_minor, claim.currency)}`,
      link: `/villas/${villa.villaId}/expenses/${claim.id}`,
      payload: { claimId: claim.id },
    });
    auditFromRequest(req, {
      action: 'expense.reimbursed',
      entityType: 'expense_claim',
      entityId: claim.id,
      summary: `Reimbursed ${formatMinor(claim.amount_minor, claim.currency)} to ${claim.staff_name}`,
      metadata: { amountMinor: claim.amount_minor, reference: input.reference ?? null },
    });
    emitToVilla(villa.villaId, { type: 'record.changed', villaId: villa.villaId, payload: { resource: 'expenses' } });
    res.json({ status: 'reimbursed' });
  }),
);

// ---------------------------------------------------------------------------
// DELETE /expenses/:claimId — drafts only
// ---------------------------------------------------------------------------
expensesRouter.delete(
  '/:claimId',
  asyncHandler(async (req, res) => {
    const villa = requireVilla(req);
    const claim = loadClaim(villa.villaId, String(req.params.claimId));
    if (claim.membership_id !== villa.membershipId) throw forbidden('You can only delete your own claims');
    if (claim.status !== 'draft') {
      throw conflict('A submitted claim cannot be deleted; withdraw it first');
    }
    execute('DELETE FROM expense_claims WHERE id = ? AND villa_id = ?', [claim.id, villa.villaId]);
    auditFromRequest(req, { action: 'expense.deleted', entityType: 'expense_claim', entityId: claim.id });
    res.status(204).end();
  }),
);
