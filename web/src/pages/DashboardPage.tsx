import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { formatDate, formatMoney, formatTime, relativeTime } from '../lib/format.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { Spinner } from '../components/ui.tsx';

type Dashboard = {
  /** A null field means the caller lacks the permission for that resource. */
  me: {
    openTasks: number | null;
    overdueTasks: number | null;
    upcomingShifts: Array<{ id: string; title: string; startsAt: string; endsAt: string; location: string | null }> | null;
    pendingClaims: number | null;
    pendingClaimAmountMinor: number | null;
  };
  approvals: {
    expenseClaims: number | null;
    expenseClaimAmountMinor: number | null;
    leaveRequests: number | null;
    shiftSwaps: number | null;
  };
  team: {
    onShiftToday: Array<{ membershipId: string; fullName: string; startsAt: string; endsAt: string }>;
    onLeaveToday: Array<{ fullName: string; leaveType: string; until: string }>;
    openTasks: number;
    unassignedShiftsThisWeek: number;
  } | null;
  currency: string;
};

export function DashboardPage() {
  const { villa } = useVilla();
  const { user } = useAuth();

  const { data, isPending } = useQuery({
    queryKey: ['dashboard', villa.id],
    queryFn: () => api<Dashboard>(`/villas/${villa.id}/reports/dashboard`),
  });

  if (isPending || !data) return <Spinner label="Loading your day" />;

  const base = `/villas/${villa.id}`;
  const firstName = user?.fullName.split(' ')[0] ?? 'there';
  const shifts = data.me.upcomingShifts;
  const pendingApprovals =
    (data.approvals.expenseClaims ?? 0) + (data.approvals.leaveRequests ?? 0) + (data.approvals.shiftSwaps ?? 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`Here's what's happening at ${villa.name} today.`}
      />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {data.me.openTasks !== null && (
          <StatCard
            label="Your open tasks"
            value={String(data.me.openTasks)}
            detail={(data.me.overdueTasks ?? 0) > 0 ? `${data.me.overdueTasks} overdue` : 'Nothing overdue'}
            tone={(data.me.overdueTasks ?? 0) > 0 ? 'warn' : 'default'}
            to={`${base}/tasks`}
          />
        )}
        {shifts !== null && (
          <StatCard
            label="Your next shift"
            value={shifts[0] ? formatDate(shifts[0].startsAt, villa.timezone) : '—'}
            detail={
              shifts[0]
                ? `${formatTime(shifts[0].startsAt, villa.timezone)}–${formatTime(shifts[0].endsAt, villa.timezone)}`
                : 'No shifts rostered'
            }
            to={`${base}/roster`}
          />
        )}
        {data.me.pendingClaims !== null && (
          <StatCard
            label="Your claims awaiting approval"
            value={String(data.me.pendingClaims)}
            detail={
              data.me.pendingClaims > 0
                ? formatMoney(data.me.pendingClaimAmountMinor ?? 0, data.currency)
                : 'All settled'
            }
            to={`${base}/expenses`}
          />
        )}
        <StatCard
          label="Waiting on you"
          value={String(pendingApprovals)}
          detail={pendingApprovals > 0 ? 'Approvals to review' : 'Nothing to approve'}
          tone={pendingApprovals > 0 ? 'action' : 'default'}
          to={`${base}/expenses`}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-slate-900">Your upcoming shifts</h2>
          {shifts === null ? (
            <p className="mt-3 text-sm text-slate-500">You do not have access to the roster.</p>
          ) : shifts.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Nothing on your roster yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-sand-100">
              {shifts.map((shift) => (
                <li key={shift.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{shift.title}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(shift.startsAt, villa.timezone)} ·{' '}
                      {formatTime(shift.startsAt, villa.timezone)}–{formatTime(shift.endsAt, villa.timezone)}
                      {shift.location ? ` · ${shift.location}` : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{relativeTime(shift.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {data.team ? (
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">The team today</h2>
            <dl className="mt-3 space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">On shift</dt>
                <dd className="font-medium text-slate-900">{data.team.onShiftToday.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">On leave</dt>
                <dd className="font-medium text-slate-900">{data.team.onLeaveToday.length}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-slate-600">Open tasks</dt>
                <dd className="font-medium text-slate-900">{data.team.openTasks}</dd>
              </div>
              {data.team.unassignedShiftsThisWeek > 0 && (
                <div className="flex items-baseline justify-between gap-3 rounded-lg bg-amber-50 px-2 py-1.5">
                  <dt className="text-amber-900">Unfilled shifts this week</dt>
                  <dd className="font-semibold text-amber-900">{data.team.unassignedShiftsThisWeek}</dd>
                </div>
              )}
            </dl>

            {data.team.onLeaveToday.length > 0 && (
              <div className="mt-4 border-t border-sand-100 pt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Away today</p>
                <ul className="mt-2 space-y-1.5">
                  {data.team.onLeaveToday.map((entry) => (
                    <li key={`${entry.fullName}-${entry.until}`} className="text-sm text-slate-700">
                      {entry.fullName}
                      <span className="text-slate-500">
                        {' '}
                        — {entry.leaveType} until {formatDate(entry.until)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-slate-900">Quick actions</h2>
            <div className="mt-3 space-y-2">
              <Link to={`${base}/expenses`} className="btn-secondary w-full justify-start">
                Submit an expense claim
              </Link>
              <Link to={`${base}/leave`} className="btn-secondary w-full justify-start">
                Request leave
              </Link>
              <Link to={`${base}/messages`} className="btn-secondary w-full justify-start">
                Message the team
              </Link>
            </div>
          </section>
        )}
      </div>

      {pendingApprovals > 0 && (
        <section className="mt-6 card p-5">
          <h2 className="text-sm font-semibold text-slate-900">Waiting for your decision</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-3">
            {data.approvals.expenseClaims !== null && data.approvals.expenseClaims > 0 && (
              <ApprovalTile
                to={`${base}/expenses`}
                label="Expense claims"
                count={data.approvals.expenseClaims}
                detail={formatMoney(data.approvals.expenseClaimAmountMinor ?? 0, data.currency)}
              />
            )}
            {data.approvals.leaveRequests !== null && data.approvals.leaveRequests > 0 && (
              <ApprovalTile to={`${base}/leave`} label="Leave requests" count={data.approvals.leaveRequests} />
            )}
            {data.approvals.shiftSwaps !== null && data.approvals.shiftSwaps > 0 && (
              <ApprovalTile to={`${base}/roster`} label="Shift swaps" count={data.approvals.shiftSwaps} />
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function StatCard({
  label,
  value,
  detail,
  to,
  tone = 'default',
}: {
  label: string;
  value: string;
  detail: string;
  to: string;
  tone?: 'default' | 'warn' | 'action';
}) {
  const accent =
    tone === 'warn' ? 'text-amber-700' : tone === 'action' ? 'text-brand-700' : 'text-slate-500';
  return (
    <Link to={to} className="card block p-4 transition hover:border-brand-400 hover:shadow-md">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className={`mt-1 text-xs ${accent}`}>{detail}</p>
    </Link>
  );
}

function ApprovalTile({
  to,
  label,
  count,
  detail,
}: {
  to: string;
  label: string;
  count: number;
  detail?: string;
}) {
  return (
    <li>
      <Link to={to} className="block rounded-lg border border-sand-200 p-3 transition hover:border-brand-400">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        <p className="mt-1 text-lg font-semibold text-brand-700">{count}</p>
        {detail && <p className="text-xs text-slate-500">{detail}</p>}
      </Link>
    </li>
  );
}
