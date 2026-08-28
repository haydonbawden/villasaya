import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { formatDate, formatDuration, formatTime, toLocalInputValue } from '../lib/format.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { Avatar, Button, EmptyState, ErrorNote, Field, Modal, Spinner, StatusPill } from '../components/ui.tsx';
import type { Member, Shift } from '../lib/types.ts';

/** Monday-anchored week containing `date`. */
function startOfWeek(date: Date): Date {
  const result = new Date(date);
  const day = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - day);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function RosterPage() {
  const { villa, can, scope } = useVilla();
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [editing, setEditing] = useState<Shift | 'new' | null>(null);

  const weekEnd = useMemo(() => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 7);
    return end;
  }, [weekStart]);

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const day = new Date(weekStart);
        day.setDate(day.getDate() + index);
        return day;
      }),
    [weekStart],
  );

  const canManage = can('roster:manage');
  const { data, isPending } = useQuery({
    queryKey: ['roster', villa.id, weekStart.toISOString()],
    queryFn: () =>
      api<{ shifts: Shift[] }>(
        `/villas/${villa.id}/roster?from=${weekStart.toISOString()}&to=${weekEnd.toISOString()}&includeDrafts=${canManage}`,
      ),
  });

  const publish = useMutation({
    mutationFn: () =>
      api<{ published: number }>(`/villas/${villa.id}/roster/publish`, {
        body: { from: weekStart.toISOString(), to: weekEnd.toISOString() },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roster', villa.id] }),
  });

  const shiftsByDay = useMemo(() => {
    const map = new Map<string, Shift[]>();
    for (const shift of data?.shifts ?? []) {
      const key = new Date(shift.startsAt).toDateString();
      map.set(key, [...(map.get(key) ?? []), shift]);
    }
    return map;
  }, [data]);

  const draftCount = (data?.shifts ?? []).filter((shift) => shift.status === 'draft').length;

  if (isPending) return <Spinner label="Loading the roster" />;

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Roster"
        description={scope('roster') === 'own' ? 'Your published shifts.' : 'Plan the week and publish it to the team.'}
        actions={
          <>
            <div className="flex items-center gap-1 rounded-lg border border-sand-300 bg-white">
              <button
                type="button"
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-sand-100"
                onClick={() => setWeekStart((current) => new Date(current.getTime() - 7 * 86_400_000))}
                aria-label="Previous week"
              >
                ‹
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-sand-100"
                onClick={() => setWeekStart(startOfWeek(new Date()))}
              >
                This week
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-sand-100"
                onClick={() => setWeekStart((current) => new Date(current.getTime() + 7 * 86_400_000))}
                aria-label="Next week"
              >
                ›
              </button>
            </div>
            {can('roster:publish') && draftCount > 0 && (
              <Button variant="secondary" loading={publish.isPending} onClick={() => publish.mutate()}>
                Publish {draftCount} draft{draftCount === 1 ? '' : 's'}
              </Button>
            )}
            {canManage && <Button onClick={() => setEditing('new')}>Add shift</Button>}
          </>
        }
      />

      <p className="mb-4 text-sm text-slate-600">
        Week of {formatDate(weekStart.toISOString(), villa.timezone)}
      </p>

      {(data?.shifts.length ?? 0) === 0 ? (
        <EmptyState
          title="No shifts this week"
          description={canManage ? 'Add shifts and publish them so the team can see their hours.' : 'Nothing rostered for you yet.'}
          action={canManage ? <Button onClick={() => setEditing('new')}>Add shift</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {days.map((day) => {
            const shifts = (shiftsByDay.get(day.toDateString()) ?? []).sort((a, b) =>
              a.startsAt.localeCompare(b.startsAt),
            );
            const isToday = day.toDateString() === new Date().toDateString();
            return (
              <section
                key={day.toISOString()}
                className={`rounded-xl border p-2.5 ${isToday ? 'border-brand-400 bg-brand-50/40' : 'border-sand-200 bg-white'}`}
              >
                <header className="mb-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {day.toLocaleDateString('en-GB', { weekday: 'short' })}
                  </p>
                  <p className="text-sm font-medium text-slate-800">{day.getDate()}</p>
                </header>
                <ul className="space-y-1.5">
                  {shifts.map((shift) => (
                    <li key={shift.id}>
                      <button
                        type="button"
                        disabled={!canManage}
                        onClick={() => canManage && setEditing(shift)}
                        className={`w-full rounded-lg border p-2 text-left transition ${
                          shift.status === 'draft'
                            ? 'border-dashed border-slate-300 bg-slate-50'
                            : 'border-sand-200 bg-white hover:border-brand-300'
                        } ${canManage ? 'cursor-pointer' : 'cursor-default'}`}
                      >
                        <p className="text-xs font-medium text-slate-800">
                          {formatTime(shift.startsAt, villa.timezone)}–{formatTime(shift.endsAt, villa.timezone)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          {shift.isOpen ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                              Open shift
                            </span>
                          ) : (
                            <>
                              <Avatar name={shift.staffName ?? ''} colour={shift.avatarColour} size="sm" />
                              <span className="truncate text-xs text-slate-700">{shift.staffName}</span>
                            </>
                          )}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {shift.title} · {formatDuration(shift.paidMinutes)}
                        </p>
                        {shift.status === 'draft' && (
                          <span className="mt-1 inline-block text-[11px] font-medium text-slate-500">Draft</span>
                        )}
                      </button>
                    </li>
                  ))}
                  {shifts.length === 0 && <li className="py-3 text-center text-[11px] text-slate-400">—</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <SwapPanel />

      {editing && (
        <ShiftModal
          shift={editing === 'new' ? null : editing}
          defaultDate={weekStart}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ShiftModal({
  shift,
  defaultDate,
  onClose,
}: {
  shift: Shift | null;
  defaultDate: Date;
  onClose: () => void;
}) {
  const { villa, can } = useVilla();
  const queryClient = useQueryClient();
  const [warning, setWarning] = useState<string | null>(null);

  const initialStart = shift ? toLocalInputValue(shift.startsAt) : `${defaultDate.toISOString().slice(0, 10)}T08:00`;
  const initialEnd = shift ? toLocalInputValue(shift.endsAt) : `${defaultDate.toISOString().slice(0, 10)}T16:00`;

  const [form, setForm] = useState({
    membershipId: shift?.membershipId ?? '',
    title: shift?.title ?? 'Shift',
    startsAt: initialStart,
    endsAt: initialEnd,
    breakMinutes: shift?.breakMinutes ?? 30,
    location: shift?.location ?? '',
    notes: shift?.notes ?? '',
  });

  const { data: members } = useQuery({
    queryKey: ['members', villa.id],
    queryFn: () => api<{ members: Member[] }>(`/villas/${villa.id}/members`),
    enabled: can('members:view'),
  });

  const save = useMutation({
    mutationFn: () => {
      const body = {
        membershipId: form.membershipId || null,
        title: form.title,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        breakMinutes: Number(form.breakMinutes),
        location: form.location || null,
        notes: form.notes || null,
      };
      return shift
        ? api<{ warning: string | null }>(`/villas/${villa.id}/roster/${shift.id}`, { method: 'PATCH', body })
        : api<{ warning: string | null }>(`/villas/${villa.id}/roster`, { body });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['roster', villa.id] });
      // A leave clash is a warning, not a rejection: the manager may genuinely
      // want to roster someone who has since asked for the day off.
      if (result.warning) setWarning(result.warning);
      else onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/villas/${villa.id}/roster/${shift?.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roster', villa.id] });
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setWarning(null);
    save.mutate();
  }

  return (
    <Modal title={shift ? 'Edit shift' : 'Add shift'} onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={save.error instanceof ApiError ? save.error.message : null} />
        {warning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p>{warning}</p>
            <button type="button" className="mt-1.5 text-xs font-medium underline" onClick={onClose}>
              Saved anyway — close
            </button>
          </div>
        )}
        <Field label="Who is working?" hint="Leave empty to create an open shift anyone can be assigned to.">
          <select
            className="input"
            value={form.membershipId}
            onChange={(e) => setForm({ ...form, membershipId: e.target.value })}
          >
            <option value="">Open shift</option>
            {members?.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.fullName}
                {member.jobTitle ? ` — ${member.jobTitle}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Shift name">
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts">
            <input
              className="input"
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </Field>
          <Field label="Ends">
            <input
              className="input"
              type="datetime-local"
              required
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Unpaid break (minutes)">
            <input
              className="input"
              type="number"
              min={0}
              max={600}
              value={form.breakMinutes}
              onChange={(e) => setForm({ ...form, breakMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Location (optional)">
            <input
              className="input"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </Field>
        </div>
        <Field label="Notes (optional)">
          <textarea
            className="input min-h-16"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </Field>

        <div className="flex justify-between gap-2 pt-1">
          {shift ? (
            <Button type="button" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {shift ? 'Save changes' : 'Add shift'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

type Swap = {
  id: string;
  status: string;
  reason: string | null;
  created_at: string;
  shift_id: string;
  starts_at: string;
  ends_at: string;
  title: string;
  requester: string;
  target: string | null;
  decision_note: string | null;
};

function SwapPanel() {
  const { villa, can } = useVilla();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['swaps', villa.id],
    queryFn: () => api<{ swaps: Swap[] }>(`/villas/${villa.id}/roster/swaps`),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) =>
      api(`/villas/${villa.id}/roster/swaps/${id}/decision`, { body: { decision } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['swaps', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['roster', villa.id] });
    },
  });

  const open = (data?.swaps ?? []).filter((swap) => swap.status === 'pending');
  if (open.length === 0) return null;

  return (
    <section className="mt-8 card p-5">
      <h2 className="text-sm font-semibold text-slate-900">Shift swap requests</h2>
      <ul className="mt-3 divide-y divide-sand-100">
        {open.map((swap) => (
          <li key={swap.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm text-slate-800">
                <span className="font-medium">{swap.requester}</span> wants to hand over {swap.title} on{' '}
                {formatDate(swap.starts_at, villa.timezone)}
                {swap.target ? ` to ${swap.target}` : ''}
              </p>
              {swap.reason && <p className="mt-0.5 text-xs text-slate-500">{swap.reason}</p>}
            </div>
            {can('roster:swap.approve') ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => decide.mutate({ id: swap.id, decision: 'rejected' })}>
                  Decline
                </Button>
                <Button onClick={() => decide.mutate({ id: swap.id, decision: 'approved' })}>Approve</Button>
              </div>
            ) : (
              <StatusPill status={swap.status} />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
