import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, uploadFile } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { formatDate, formatMoney, toMinorUnits, todayIso } from '../lib/format.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorNote,
  Field,
  LoadError,
  Modal,
  SkeletonList,
  StatusPill,
} from '../components/ui.tsx';
import { IconPaperclip, IconPlus } from '../components/icons.tsx';
import type { ExpenseCategory, ExpenseClaim } from '../lib/types.ts';

const FILTERS = [
  { key: 'submitted', label: 'Awaiting approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'reimbursed', label: 'Reimbursed' },
  { key: '', label: 'All' },
] as const;

export function ExpensesPage() {
  const { villa, can, membershipId, scope } = useVilla();

  usePageTitle('Expenses', villa.name);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>('submitted');
  const [creating, setCreating] = useState(false);
  const [openClaim, setOpenClaim] = useState<ExpenseClaim | null>(null);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['expenses', villa.id, filter],
    queryFn: () =>
      api<{ claims: ExpenseClaim[]; totalsByStatusMinor: Record<string, number>; currency: string }>(
        `/villas/${villa.id}/expenses${filter ? `?status=${filter}` : ''}`,
      ),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['expenses', villa.id] });
    void queryClient.invalidateQueries({ queryKey: ['dashboard', villa.id] });
  };

  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      api(`/villas/${villa.id}/expenses/${id}/decision`, { body: { decision, note } }),
    onSuccess: () => {
      invalidate();
      setOpenClaim(null);
    },
  });

  const reimburse = useMutation({
    mutationFn: ({ id, reference }: { id: string; reference?: string }) =>
      api(`/villas/${villa.id}/expenses/${id}/reimburse`, { body: { reference } }),
    onSuccess: () => {
      invalidate();
      setOpenClaim(null);
    },
  });

  const total = Object.values(data?.totalsByStatusMinor ?? {}).reduce((sum, value) => sum + value, 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Expense claims"
        description={
          scope('expenses') === 'own'
            ? 'Money you have spent for the villa, and where each claim stands.'
            : 'Claims from the team, ready to approve and reimburse.'
        }
        actions={
          can('expenses:submit') ? (
            <Button onClick={() => setCreating(true)}>
              <IconPlus size={16} /> New claim
            </Button>
          ) : undefined
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="scroll-row rounded-lg text-sm sm:border sm:border-sand-300 sm:bg-white sm:p-0.5">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`min-h-11 rounded px-3.5 sm:min-h-9 ${
                filter === option.key ? 'bg-brand-50 font-medium text-brand-800' : 'text-slate-600 hover:bg-sand-100'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {total > 0 && (
          <p className="text-sm text-slate-600">
            Total shown: <span className="font-semibold text-slate-900">{formatMoney(total, villa.currency)}</span>
          </p>
        )}
      </div>

      {isError ? (
        <LoadError message={error instanceof ApiError ? error.message : null} onRetry={() => void refetch()} />
      ) : isPending ? (
        <SkeletonList rows={4} />
      ) : (data?.claims.length ?? 0) === 0 ? (
        <EmptyState
          title="No claims here"
          description={
            filter === 'submitted' ? 'Nothing is waiting for approval right now.' : 'Claims will show up here.'
          }
          action={can('expenses:submit') ? <Button onClick={() => setCreating(true)}>New claim</Button> : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {data?.claims.map((claim) => (
            <li key={claim.id}>
              <button
                type="button"
                onClick={() => setOpenClaim(claim)}
                className="card flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition hover:border-brand-300"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={claim.staffName} colour={claim.avatarColour} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{claim.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {claim.reference} · {claim.staffName} · {formatDate(claim.spentOn)}
                      {claim.category?.name ? ` · ${claim.category.name}` : ''}
                      {claim.receipts.length > 0 ? ` · ${claim.receipts.length} receipt${claim.receipts.length === 1 ? '' : 's'}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    {formatMoney(claim.amountMinor, claim.currency)}
                  </span>
                  <StatusPill status={claim.status} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating && <ClaimFormModal onClose={() => setCreating(false)} />}
      {openClaim && (
        <ClaimDetailModal
          claim={openClaim}
          onClose={() => setOpenClaim(null)}
          canApprove={can('expenses:approve') && openClaim.membershipId !== membershipId}
          canReimburse={can('expenses:reimburse')}
          onDecide={(decision, note) => decide.mutate({ id: openClaim.id, decision, note })}
          onReimburse={(reference) => reimburse.mutate({ id: openClaim.id, reference })}
          busy={decide.isPending || reimburse.isPending}
          error={
            decide.error instanceof ApiError
              ? decide.error.message
              : reimburse.error instanceof ApiError
                ? reimburse.error.message
                : null
          }
        />
      )}
    </div>
  );
}

function ClaimFormModal({ onClose }: { onClose: () => void }) {
  const { villa, can } = useVilla();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    title: '',
    amount: '',
    spentOn: todayIso(),
    categoryId: '',
    merchant: '',
    description: '',
    paymentMethod: 'own_funds' as ExpenseClaim['paymentMethod'],
  });
  const [receipts, setReceipts] = useState<Array<{ id: string; filename: string }>>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ['expenseCategories', villa.id],
    queryFn: () => api<{ categories: ExpenseCategory[] }>(`/villas/${villa.id}/expenses/categories`),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/expenses`, {
        body: {
          title: form.title,
          amountMinor: toMinorUnits(form.amount, villa.currency),
          spentOn: form.spentOn,
          categoryId: form.categoryId || null,
          merchant: form.merchant || null,
          description: form.description || null,
          paymentMethod: form.paymentMethod,
          attachmentIds: receipts.map((receipt) => receipt.id),
          submit: true,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', villa.id] });
      onClose();
    },
  });

  async function onFileChange(files: FileList | null) {
    if (!files?.length) return;
    setUploadError(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const attachment = await uploadFile(villa.id, file);
        setReceipts((previous) => [...previous, { id: attachment.id, filename: attachment.filename }]);
      }
    } catch (caught) {
      setUploadError(caught instanceof ApiError ? caught.message : 'Could not upload that file.');
    } finally {
      setUploading(false);
    }
  }

  // A category with an auto-approval limit clears small claims immediately;
  // saying so up front avoids a manager wondering why nothing arrived.
  const selectedCategory = categories?.categories.find((category) => category.id === form.categoryId);
  const willAutoApprove =
    selectedCategory?.autoApproveLimitMinor != null &&
    toMinorUnits(form.amount, villa.currency) <= selectedCategory.autoApproveLimitMinor &&
    toMinorUnits(form.amount, villa.currency) > 0;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal title="New expense claim" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        <Field label="What did you buy?">
          <input
            className="input"
            required
            autoFocus
            placeholder="Replacement pool pump seal"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${villa.currency})`}>
            <input
              className="input"
              required
              inputMode="decimal"
              placeholder="850000"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </Field>
          <Field label="Date of spending">
            <input
              className="input"
              type="date"
              required
              max={todayIso()}
              value={form.spentOn}
              onChange={(e) => setForm({ ...form, spentOn: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <select
              className="input"
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">Uncategorised</option>
              {categories?.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Paid with">
            <select
              className="input"
              value={form.paymentMethod}
              onChange={(e) => setForm({ ...form, paymentMethod: e.target.value as ExpenseClaim['paymentMethod'] })}
            >
              <option value="own_funds">My own money</option>
              <option value="villa_cash">Villa petty cash</option>
              <option value="villa_card">Villa card</option>
            </select>
          </Field>
        </div>
        <Field label="Shop or supplier (optional)">
          <input className="input" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} />
        </Field>
        <Field label="Notes (optional)">
          <textarea
            className="input min-h-16"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </Field>

        {can('files:upload') && (
          <Field label="Receipt photos" hint="JPEG, PNG, WebP, HEIC or PDF, up to 10MB each.">
            <input
              className="input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,application/pdf"
              multiple
              onChange={(event) => void onFileChange(event.target.files)}
            />
            {uploading && <p className="mt-1 text-xs text-slate-500">Uploading…</p>}
            {uploadError && <p className="mt-1 text-xs text-red-700">{uploadError}</p>}
            {receipts.length > 0 && (
              <ul className="mt-2 space-y-1">
                {receipts.map((receipt) => (
                  <li key={receipt.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                    <span className="truncate"><IconPaperclip size={14} /> {receipt.filename}</span>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-red-600"
                      onClick={() => setReceipts((previous) => previous.filter((item) => item.id !== receipt.id))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>
        )}

        {willAutoApprove && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            This is within the {selectedCategory?.name} limit, so it will be approved automatically.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending} disabled={uploading}>
            Submit claim
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ClaimDetailModal({
  claim,
  onClose,
  canApprove,
  canReimburse,
  onDecide,
  onReimburse,
  busy,
  error,
}: {
  claim: ExpenseClaim;
  onClose: () => void;
  canApprove: boolean;
  canReimburse: boolean;
  onDecide: (decision: 'approved' | 'rejected', note?: string) => void;
  onReimburse: (reference?: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const { villa } = useVilla();
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');

  return (
    <Modal title={claim.title} description={claim.reference} onClose={onClose}>
      <div className="space-y-4">
        <ErrorNote message={error} />
        <div className="flex items-center justify-between">
          <p className="text-2xl font-semibold text-slate-900">{formatMoney(claim.amountMinor, claim.currency)}</p>
          <StatusPill status={claim.status} />
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-slate-500">Claimed by</dt>
          <dd className="text-slate-800">{claim.staffName}</dd>
          <dt className="text-slate-500">Date spent</dt>
          <dd className="text-slate-800">{formatDate(claim.spentOn)}</dd>
          <dt className="text-slate-500">Category</dt>
          <dd className="text-slate-800">{claim.category?.name ?? 'Uncategorised'}</dd>
          <dt className="text-slate-500">Paid with</dt>
          <dd className="text-slate-800">{claim.paymentMethod.replace(/_/g, ' ')}</dd>
          {claim.merchant && (
            <>
              <dt className="text-slate-500">Supplier</dt>
              <dd className="text-slate-800">{claim.merchant}</dd>
            </>
          )}
        </dl>

        {claim.description && <p className="whitespace-pre-wrap text-sm text-slate-700">{claim.description}</p>}

        {claim.receipts.length > 0 && (
          <div>
            <p className="label">Receipts</p>
            <ul className="space-y-1">
              {claim.receipts.map((receipt) => (
                <li key={receipt.id}>
                  <a
                    className="text-sm text-brand-700 hover:underline"
                    href={`/api/villas/${villa.id}/files/${receipt.id}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <IconPaperclip size={14} /> {receipt.filename}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {claim.decisionNote && (
          <p className="rounded-lg bg-sand-100 px-3 py-2 text-sm text-slate-700">
            <span className="font-medium">{claim.decidedBy ?? 'Decision'}:</span> {claim.decisionNote}
          </p>
        )}

        {canApprove && claim.status === 'submitted' && (
          <div className="space-y-2 border-t border-sand-100 pt-4">
            <Field label="Note (required when declining)">
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" loading={busy} onClick={() => onDecide('rejected', note || undefined)}>
                Decline
              </Button>
              <Button loading={busy} onClick={() => onDecide('approved', note || undefined)}>
                Approve
              </Button>
            </div>
          </div>
        )}

        {canReimburse && claim.status === 'approved' && (
          <div className="space-y-2 border-t border-sand-100 pt-4">
            <Field label="Payment reference (optional)" hint="Bank transfer reference or petty-cash note.">
              <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
            </Field>
            <div className="flex justify-end">
              <Button loading={busy} onClick={() => onReimburse(reference || undefined)}>
                Mark as reimbursed
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
