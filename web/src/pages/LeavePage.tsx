import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { formatDate, todayIso } from '../lib/format.ts';
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
import { IconPlus } from '../components/icons.tsx';
import { usePageTitle } from '../lib/usePageTitle.ts';
import type { LeaveBalance, LeaveRequest, LeaveType } from '../lib/types.ts';

export function LeavePage() {
  const { villa, can, membershipId, scope } = useVilla();
  const queryClient = useQueryClient();
  const [requesting, setRequesting] = useState(false);
  const [declining, setDeclining] = useState<LeaveRequest | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  usePageTitle('Leave', villa.name);

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['leave', villa.id, filter],
    queryFn: () =>
      api<{ requests: LeaveRequest[] }>(
        `/villas/${villa.id}/leave${filter === 'pending' ? '?status=pending' : ''}`,
      ),
  });

  const { data: balances } = useQuery({
    queryKey: ['leaveBalances', villa.id, membershipId],
    queryFn: () => api<{ balances: LeaveBalance[] }>(`/villas/${villa.id}/leave/balances`),
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, note }: { id: string; decision: 'approved' | 'rejected'; note?: string }) =>
      api(`/villas/${villa.id}/leave/${id}/decision`, { body: { decision, note } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['leaveBalances', villa.id] });
    },
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/villas/${villa.id}/leave/${id}/cancel`, { method: 'POST', body: {} }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['leaveBalances', villa.id] });
    },
  });

  const canApprove = can('leave:approve');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Leave"
        description={scope('leave') === 'own' ? 'Your time off and remaining balance.' : 'Requests and balances across the team.'}
        actions={
          <>
            <div className="flex rounded-lg border border-sand-300 bg-white text-sm">
              {(['pending', 'all'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={`min-h-11 px-3.5 sm:min-h-9 ${
                    filter === value ? 'font-medium text-brand-800' : 'text-slate-600 hover:bg-sand-100'
                  }`}
                >
                  {value === 'pending' ? 'Pending' : 'All'}
                </button>
              ))}
            </div>
            {can('leave:request') && (
              <Button onClick={() => setRequesting(true)}>
                <IconPlus size={16} /> Request leave
              </Button>
            )}
          </>
        }
      />

      {balances && balances.balances.length > 0 && (
        <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {balances.balances.map((balance) => (
            <div key={balance.leaveTypeId} className="card p-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: balance.colour }}
                  aria-hidden="true"
                />
                <p className="text-xs font-medium text-slate-600">{balance.leaveTypeName}</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {balance.remainingDays === null ? '∞' : balance.remainingDays}
                <span className="ml-1 text-sm font-normal text-slate-500">
                  {balance.remainingDays === null ? 'untracked' : 'days left'}
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {balance.takenDays} taken
                {balance.pendingDays > 0 ? ` · ${balance.pendingDays} pending` : ''}
              </p>
            </div>
          ))}
        </section>
      )}

      {isError ? (
        <LoadError message={error instanceof ApiError ? error.message : null} onRetry={() => void refetch()} />
      ) : isPending ? (
        <SkeletonList rows={3} />
      ) : (data?.requests.length ?? 0) === 0 ? (
        <EmptyState
          title={filter === 'pending' ? 'Nothing waiting' : 'No leave recorded'}
          description={
            filter === 'pending' ? 'There are no leave requests to review right now.' : 'Requests will appear here.'
          }
          action={can('leave:request') ? <Button onClick={() => setRequesting(true)}>Request leave</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {data?.requests.map((request) => (
            <li key={request.id} className="card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <Avatar name={request.staffName} colour={request.avatarColour} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {request.staffName}
                      <span className="ml-2 font-normal text-slate-500">{request.leaveType.name}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-600">
                      {formatDate(request.startDate)} – {formatDate(request.endDate)}
                      <span className="text-slate-400"> · {request.totalDays} day{request.totalDays === 1 ? '' : 's'}</span>
                    </p>
                    {request.reason && <p className="mt-1 text-sm text-slate-500">{request.reason}</p>}
                    {request.decisionNote && (
                      <p className="mt-1 text-xs text-slate-500">
                        {request.decidedBy}: {request.decisionNote}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={request.status} />
                  {/* Approving your own leave is blocked server-side; hiding the
                      buttons keeps the UI honest about that. */}
                  {canApprove && request.status === 'pending' && request.membershipId !== membershipId && (
                    <>
                      <Button variant="secondary" onClick={() => setDeclining(request)}>
                        Decline
                      </Button>
                      <Button onClick={() => decide.mutate({ id: request.id, decision: 'approved' })}>Approve</Button>
                    </>
                  )}
                  {request.status === 'pending' && request.membershipId === membershipId && (
                    <Button variant="secondary" onClick={() => cancel.mutate(request.id)}>
                      Cancel
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {requesting && <LeaveRequestModal onClose={() => setRequesting(false)} />}
      {declining && (
        <DeclineLeaveModal
          request={declining}
          onClose={() => setDeclining(null)}
          onConfirm={(note) => {
            decide.mutate({ id: declining.id, decision: 'rejected', note });
            setDeclining(null);
          }}
          busy={decide.isPending}
        />
      )}
    </div>
  );
}

function LeaveRequestModal({ onClose }: { onClose: () => void }) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    leaveTypeId: '',
    startDate: todayIso(),
    endDate: todayIso(),
    startHalfDay: false,
    endHalfDay: false,
    reason: '',
  });

  const { data: types } = useQuery({
    queryKey: ['leaveTypes', villa.id],
    queryFn: () => api<{ types: LeaveType[] }>(`/villas/${villa.id}/leave/types`),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/leave`, {
        body: {
          leaveTypeId: form.leaveTypeId,
          startDate: form.startDate,
          endDate: form.endDate,
          startHalfDay: form.startHalfDay,
          endHalfDay: form.endHalfDay,
          reason: form.reason || undefined,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['leave', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['leaveBalances', villa.id] });
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal title="Request leave" onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        <Field label="Type of leave">
          <select
            className="input"
            required
            value={form.leaveTypeId}
            onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })}
          >
            <option value="">Choose…</option>
            {types?.types.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
                {type.isPaid ? '' : ' (unpaid)'}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <input
              className="input"
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value, endDate: e.target.value > form.endDate ? e.target.value : form.endDate })}
            />
          </Field>
          <Field label="To">
            <input
              className="input"
              type="date"
              required
              min={form.startDate}
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="checkbox"
              checked={form.startHalfDay}
              onChange={(e) => setForm({ ...form, startHalfDay: e.target.checked })}
            />
            Half day on the first day
          </label>
          {form.endDate !== form.startDate && (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="checkbox"
                checked={form.endHalfDay}
                onChange={(e) => setForm({ ...form, endHalfDay: e.target.checked })}
              />
              Half day on the last day
            </label>
          )}
        </div>
        <Field label="Reason (optional)">
          <textarea
            className="input min-h-20"
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Submit request
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Declining needs a reason the person can read later, so it is collected in
 * the app rather than through a browser prompt that cannot be styled, cannot
 * be cancelled cleanly and looks nothing like the rest of the product.
 */
function DeclineLeaveModal({
  request,
  onClose,
  onConfirm,
  busy,
}: {
  request: LeaveRequest;
  onClose: () => void;
  onConfirm: (note: string | undefined) => void;
  busy: boolean;
}) {
  const [note, setNote] = useState('');

  return (
    <Modal
      title="Decline leave request"
      description={`${request.staffName} · ${request.leaveType.name}`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Keep pending
          </Button>
          <Button variant="danger" loading={busy} onClick={() => onConfirm(note.trim() || undefined)}>
            Decline request
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          {formatDate(request.startDate)} – {formatDate(request.endDate)} · {request.totalDays} day
          {request.totalDays === 1 ? '' : 's'}
        </p>
        <Field label="Reason (optional)" hint="Shared with the person who asked, so they know what to do next.">
          <textarea
            className="input min-h-24"
            autoFocus
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="The villa is fully booked that week."
          />
        </Field>
      </div>
    </Modal>
  );
}
