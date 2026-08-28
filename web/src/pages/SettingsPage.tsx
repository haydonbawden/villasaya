import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { formatDateTime, formatMoney } from '../lib/format.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { Button, ErrorNote, Field, Spinner } from '../components/ui.tsx';
import type { ExpenseCategory, LeaveType } from '../lib/types.ts';

export function SettingsPage() {
  const { villa, can, isOwner, reload } = useVilla();
  const [tab, setTab] = useState<'general' | 'categories' | 'leave' | 'audit'>('general');

  const tabs = [
    { key: 'general', label: 'General', visible: true },
    { key: 'categories', label: 'Expense categories', visible: can('expenses:manage_categories') },
    { key: 'leave', label: 'Leave types', visible: can('leave:manage_types') },
    { key: 'audit', label: 'Activity log', visible: can('audit:view') },
  ] as const;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Settings" description={`Configure ${villa.name}.`} />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-sand-200">
        {tabs
          .filter((entry) => entry.visible)
          .map((entry) => (
            <button
              key={entry.key}
              type="button"
              onClick={() => setTab(entry.key)}
              className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm ${
                tab === entry.key
                  ? 'border-brand-600 font-medium text-brand-800'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              {entry.label}
            </button>
          ))}
      </div>

      {tab === 'general' && <GeneralSettings onSaved={reload} isOwner={isOwner} />}
      {tab === 'categories' && <ExpenseCategorySettings />}
      {tab === 'leave' && <LeaveTypeSettings />}
      {tab === 'audit' && <AuditLog />}
    </div>
  );
}

function GeneralSettings({ onSaved, isOwner }: { onSaved: () => void; isOwner: boolean }) {
  const { villa } = useVilla();
  const [form, setForm] = useState({
    name: villa.name,
    address: villa.address ?? '',
    timezone: villa.timezone,
    currency: villa.currency,
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}`, {
        method: 'PATCH',
        body: { name: form.name, address: form.address || null, timezone: form.timezone, currency: form.currency },
      }),
    onSuccess: onSaved,
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card space-y-4 p-5" noValidate>
        <ErrorNote message={save.error instanceof ApiError ? save.error.message : null} />
        <Field label="Villa name">
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Address">
          <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Timezone">
            <select className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
              <option value="Asia/Makassar">Bali (WITA)</option>
              <option value="Asia/Jakarta">Jakarta (WIB)</option>
              <option value="Asia/Jayapura">Papua (WIT)</option>
              <option value="Asia/Singapore">Singapore</option>
              <option value="Australia/Sydney">Sydney</option>
            </select>
          </Field>
          <Field label="Currency" hint="Used for pay rates and expense claims.">
            <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="IDR">IDR — Rupiah</option>
              <option value="USD">USD — US Dollar</option>
              <option value="AUD">AUD — Australian Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="SGD">SGD — Singapore Dollar</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            Save settings
          </Button>
        </div>
      </form>

      {isOwner && <DangerZone />}
    </div>
  );
}

function DangerZone() {
  const { villa } = useVilla();
  const { refreshVillas } = useAuth();
  const navigate = useNavigate();
  const [confirmName, setConfirmName] = useState('');

  const remove = useMutation({
    mutationFn: () => api(`/villas/${villa.id}`, { method: 'DELETE', body: { confirmName } }),
    onSuccess: async () => {
      await refreshVillas();
      navigate('/', { replace: true });
    },
  });

  return (
    <section className="rounded-xl border border-red-200 bg-red-50/50 p-5">
      <h2 className="text-sm font-semibold text-red-900">Delete this villa</h2>
      <p className="mt-1 text-sm text-red-800">
        Everything goes: staff records, rosters, leave history, expense claims and messages. This cannot be
        undone.
      </p>
      <ErrorNote message={remove.error instanceof ApiError ? remove.error.message : null} />
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Field label={`Type "${villa.name}" to confirm`}>
          <input className="input" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </Field>
        <Button
          variant="danger"
          loading={remove.isPending}
          disabled={confirmName !== villa.name}
          onClick={() => remove.mutate()}
        >
          Delete villa
        </Button>
      </div>
    </section>
  );
}

function ExpenseCategorySettings() {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('');

  const { data, isPending } = useQuery({
    queryKey: ['expenseCategories', villa.id],
    queryFn: () => api<{ categories: ExpenseCategory[] }>(`/villas/${villa.id}/expenses/categories`),
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/expenses/categories`, {
        body: { name, autoApproveLimitMinor: limit ? Number(limit) : null },
      }),
    onSuccess: () => {
      setName('');
      setLimit('');
      void queryClient.invalidateQueries({ queryKey: ['expenseCategories', villa.id] });
    },
  });

  if (isPending) return <Spinner />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Claims at or below a category's limit are approved automatically, so nobody has to sign off every bag of
        groceries. Leave the limit empty to require approval every time.
      </p>
      <ul className="card divide-y divide-sand-100">
        {data?.categories.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-800">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: category.colour }} aria-hidden="true" />
              {category.name}
            </span>
            <span className="text-xs text-slate-500">
              {category.autoApproveLimitMinor == null
                ? 'Always needs approval'
                : `Auto-approve up to ${formatMoney(category.autoApproveLimitMinor, villa.currency)}`}
            </span>
          </li>
        ))}
      </ul>

      <form
        className="card flex flex-wrap items-end gap-3 p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="min-w-40 flex-1">
          <Field label="New category">
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="min-w-40 flex-1">
          <Field label={`Auto-approve limit (${villa.currency})`}>
            <input className="input" inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value)} />
          </Field>
        </div>
        <Button type="submit" loading={create.isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}

function LeaveTypeSettings() {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('');
  const [isPaid, setIsPaid] = useState(true);

  const { data, isPending } = useQuery({
    queryKey: ['leaveTypes', villa.id],
    queryFn: () => api<{ types: LeaveType[] }>(`/villas/${villa.id}/leave/types`),
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/leave/types`, {
        body: { name, isPaid, defaultQuotaDays: quota ? Number(quota) : null },
      }),
    onSuccess: () => {
      setName('');
      setQuota('');
      void queryClient.invalidateQueries({ queryKey: ['leaveTypes', villa.id] });
    },
  });

  if (isPending) return <Spinner />;

  return (
    <div className="space-y-4">
      <ul className="card divide-y divide-sand-100">
        {data?.types.map((type) => (
          <li key={type.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="flex items-center gap-2 text-sm text-slate-800">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: type.colour }} aria-hidden="true" />
              {type.name}
              {!type.isPaid && <span className="text-xs text-slate-500">(unpaid)</span>}
            </span>
            <span className="text-xs text-slate-500">
              {type.defaultQuotaDays == null ? 'No annual limit' : `${type.defaultQuotaDays} days a year`}
            </span>
          </li>
        ))}
      </ul>

      <form
        className="card flex flex-wrap items-end gap-3 p-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="min-w-40 flex-1">
          <Field label="New leave type">
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <div className="w-36">
          <Field label="Days per year">
            <input className="input" inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value)} />
          </Field>
        </div>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-700">
          <input
            type="checkbox"
            className="rounded border-sand-300 text-brand-600 focus:ring-brand-500"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
          />
          Paid
        </label>
        <Button type="submit" loading={create.isPending}>
          Add
        </Button>
      </form>
    </div>
  );
}

type AuditEntry = {
  id: string;
  action: string;
  summary: string | null;
  actorName: string | null;
  createdAt: string;
};

function AuditLog() {
  const { villa } = useVilla();
  const { data, isPending } = useQuery({
    queryKey: ['audit', villa.id],
    queryFn: () => api<{ entries: AuditEntry[] }>(`/villas/${villa.id}/audit`),
  });

  if (isPending) return <Spinner />;

  return (
    <div className="card divide-y divide-sand-100">
      {(data?.entries ?? []).length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Nothing recorded yet.</p>}
      {data?.entries.map((entry) => (
        <div key={entry.id} className="px-4 py-3">
          <p className="text-sm text-slate-800">{entry.summary ?? entry.action}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {entry.actorName ?? 'System'} · {formatDateTime(entry.createdAt, villa.timezone)} ·{' '}
            <span className="font-mono">{entry.action}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
