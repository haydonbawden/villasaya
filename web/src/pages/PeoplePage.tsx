import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { formatDate, formatMoney, relativeTime } from '../lib/format.ts';
import { PageHeader } from '../components/PageHeader.tsx';
import { Avatar, Button, EmptyState, ErrorNote, Field, Modal, Spinner, StatusPill } from '../components/ui.tsx';
import type { Member, PermissionDefinition, Role } from '../lib/types.ts';

type Invitation = {
  id: string;
  email: string;
  status: string;
  jobTitle: string | null;
  expiresAt: string;
  createdAt: string;
  role: { id: string; name: string; colour: string };
  invitedBy: string;
};

export function PeoplePage() {
  const { villa, can } = useVilla();
  const [inviting, setInviting] = useState(false);
  const [openMember, setOpenMember] = useState<Member | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ['members', villa.id],
    queryFn: () => api<{ members: Member[] }>(`/villas/${villa.id}/members`),
  });

  const canSeePay = can('members:view_sensitive');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="People"
        description="Everyone working at this villa."
        actions={can('members:invite') ? <Button onClick={() => setInviting(true)}>Invite staff</Button> : undefined}
      />

      {isPending ? (
        <Spinner label="Loading the team" />
      ) : (data?.members.length ?? 0) === 0 ? (
        <EmptyState
          title="No one here yet"
          description="Invite your housekeeper, gardener or villa manager to join the workspace."
          action={can('members:invite') ? <Button onClick={() => setInviting(true)}>Invite staff</Button> : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {data?.members.map((member) => (
            <li key={member.id}>
              <button
                type="button"
                onClick={() => setOpenMember(member)}
                className="card flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left transition hover:border-brand-300"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.fullName} colour={member.avatarColour} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{member.fullName}</p>
                    <p className="truncate text-xs text-slate-500">
                      {member.jobTitle ?? member.role.name} · {member.email}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {(member.permissionOverrides.grant.length > 0 || member.permissionOverrides.deny.length > 0) && (
                    <span className="rounded bg-sand-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
                      Custom access
                    </span>
                  )}
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ backgroundColor: `${member.role.colour}1a`, color: member.role.colour }}
                  >
                    {member.role.name}
                  </span>
                  {member.status !== 'active' && <StatusPill status={member.status} />}
                  {canSeePay && member.payRateMinor != null && (
                    <span className="hidden text-xs text-slate-500 sm:inline">
                      {formatMoney(member.payRateMinor, villa.currency)}/{member.payPeriod}
                    </span>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {can('members:invite') && <PendingInvitations />}

      {inviting && <InviteModal onClose={() => setInviting(false)} />}
      {openMember && <MemberModal member={openMember} onClose={() => setOpenMember(null)} />}
    </div>
  );
}

function PendingInvitations() {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['invitations', villa.id],
    queryFn: () => api<{ invitations: Invitation[] }>(`/villas/${villa.id}/invitations`),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api(`/villas/${villa.id}/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invitations', villa.id] }),
  });

  const resend = useMutation({
    mutationFn: (id: string) =>
      api<{ inviteLink: string }>(`/villas/${villa.id}/invitations/${id}/resend`, { method: 'POST', body: {} }),
    onSuccess: async (result, id) => {
      await navigator.clipboard.writeText(result.inviteLink).catch(() => undefined);
      setCopied(id);
      void queryClient.invalidateQueries({ queryKey: ['invitations', villa.id] });
    },
  });

  const pending = (data?.invitations ?? []).filter((invitation) => invitation.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">Pending invitations</h2>
      <ul className="space-y-2">
        {pending.map((invitation) => (
          <li key={invitation.id} className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{invitation.email}</p>
              <p className="text-xs text-slate-500">
                {invitation.role.name}
                {invitation.jobTitle ? ` · ${invitation.jobTitle}` : ''} · expires{' '}
                {relativeTime(invitation.expiresAt)}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" loading={resend.isPending} onClick={() => resend.mutate(invitation.id)}>
                {copied === invitation.id ? 'Link copied' : 'Resend & copy link'}
              </Button>
              <Button variant="ghost" onClick={() => revoke.mutate(invitation.id)}>
                Revoke
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InviteModal({ onClose }: { onClose: () => void }) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [result, setResult] = useState<{ link: string; delivered: boolean } | null>(null);

  const { data: roles } = useQuery({
    queryKey: ['roles', villa.id],
    queryFn: () => api<{ roles: Role[] }>(`/villas/${villa.id}/roles`),
  });

  const mutation = useMutation({
    mutationFn: () =>
      api<{ inviteLink: string; emailDelivered: boolean }>(`/villas/${villa.id}/invitations`, {
        body: { email, roleId, jobTitle: jobTitle || undefined },
      }),
    onSuccess: (response) => {
      setResult({ link: response.inviteLink, delivered: response.emailDelivered });
      void queryClient.invalidateQueries({ queryKey: ['invitations', villa.id] });
    },
  });

  const assignableRoles = (roles?.roles ?? []).filter((role) => !role.isOwner);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  if (result) {
    return (
      <Modal title="Invitation ready" onClose={onClose}>
        <p className="text-sm text-slate-700">
          {result.delivered
            ? `We emailed the invitation to ${email}.`
            : 'Email delivery is not configured, so send this link to them directly — WhatsApp works well.'}
        </p>
        <div className="mt-3 flex gap-2">
          <input className="input font-mono text-xs" readOnly value={result.link} />
          <Button onClick={() => void navigator.clipboard.writeText(result.link)}>Copy</Button>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Invite a staff member"
      description="They will get a link to create an account and join this villa."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        <Field label="Email address">
          <input
            className="input"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Role" hint="This decides what they can see and do. You can change it later.">
          <select className="input" required value={roleId} onChange={(event) => setRoleId(event.target.value)}>
            <option value="">Choose a role…</option>
            {assignableRoles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Job title (optional)">
          <input
            className="input"
            placeholder="Housekeeper"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Send invitation
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MemberModal({ member, onClose }: { member: Member; onClose: () => void }) {
  const { villa, can, isOwner } = useVilla();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'details' | 'access'>('details');

  const { data: roles } = useQuery({
    queryKey: ['roles', villa.id],
    queryFn: () => api<{ roles: Role[] }>(`/villas/${villa.id}/roles`),
    enabled: can('members:manage'),
  });

  const [form, setForm] = useState({
    jobTitle: member.jobTitle ?? '',
    roleId: member.role.id,
    employmentType: member.employmentType ?? 'full_time',
    payRate: member.payRateMinor != null ? String(member.payRateMinor) : '',
    payPeriod: member.payPeriod ?? 'month',
    startedOn: member.startedOn ?? '',
    status: member.status,
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['members', villa.id] });
    void queryClient.invalidateQueries({ queryKey: ['roles', villa.id] });
  };

  const save = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/members/${member.id}`, {
        method: 'PATCH',
        body: {
          jobTitle: form.jobTitle || null,
          roleId: form.roleId !== member.role.id ? form.roleId : undefined,
          employmentType: form.employmentType,
          payRateMinor: form.payRate ? Number(form.payRate) : null,
          payPeriod: form.payPeriod,
          startedOn: form.startedOn || null,
          status: form.status === 'removed' ? undefined : (form.status as 'active' | 'suspended'),
        },
      }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/villas/${villa.id}/members/${member.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const editable = can('members:manage') && !member.role.isOwner;

  return (
    <Modal title={member.fullName} description={member.email} onClose={onClose} wide>
      <div className="mb-4 flex gap-1 border-b border-sand-200">
        {(['details', 'access'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm capitalize ${
              tab === value
                ? 'border-brand-600 font-medium text-brand-800'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            {value === 'access' ? 'Access' : 'Details'}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <ErrorNote message={save.error instanceof ApiError ? save.error.message : null} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title">
              <input
                className="input"
                disabled={!editable}
                value={form.jobTitle}
                onChange={(event) => setForm({ ...form, jobTitle: event.target.value })}
              />
            </Field>
            <Field label="Role">
              <select
                className="input"
                disabled={!editable}
                value={form.roleId}
                onChange={(event) => setForm({ ...form, roleId: event.target.value })}
              >
                {(roles?.roles ?? []).map((role) => (
                  <option key={role.id} value={role.id} disabled={role.isOwner}>
                    {role.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Employment type">
              <select
                className="input"
                disabled={!editable}
                value={form.employmentType}
                onChange={(event) => setForm({ ...form, employmentType: event.target.value })}
              >
                <option value="full_time">Full time</option>
                <option value="part_time">Part time</option>
                <option value="casual">Casual</option>
                <option value="contract">Contract</option>
              </select>
            </Field>
            <Field label="Started on">
              <input
                className="input"
                type="date"
                disabled={!editable}
                value={form.startedOn}
                onChange={(event) => setForm({ ...form, startedOn: event.target.value })}
              />
            </Field>
            <Field label={`Pay rate (${villa.currency})`}>
              <input
                className="input"
                inputMode="numeric"
                disabled={!editable}
                value={form.payRate}
                onChange={(event) => setForm({ ...form, payRate: event.target.value })}
              />
            </Field>
            <Field label="Pay period">
              <select
                className="input"
                disabled={!editable}
                value={form.payPeriod}
                onChange={(event) => setForm({ ...form, payPeriod: event.target.value })}
              >
                <option value="hour">Per hour</option>
                <option value="day">Per day</option>
                <option value="week">Per week</option>
                <option value="month">Per month</option>
              </select>
            </Field>
          </div>

          {editable && (
            <Field label="Access status" hint="Suspending keeps their records but blocks sign-in to this villa.">
              <select
                className="input"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </Field>
          )}

          {member.startedOn && (
            <p className="text-xs text-slate-500">Joined {formatDate(member.startedOn)}</p>
          )}

          {editable && (
            <div className="flex justify-between gap-2 border-t border-sand-100 pt-4">
              {can('members:remove') ? (
                <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                  Remove from villa
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" loading={save.isPending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </form>
      ) : (
        <AccessTab member={member} canEdit={can('roles:manage') && !member.role.isOwner} isOwner={isOwner} />
      )}
    </Modal>
  );
}

/**
 * Per-person exceptions on top of the role. This is what lets an owner say
 * "the head housekeeper is Staff, but she can also approve small claims"
 * without inventing a whole new role.
 */
function AccessTab({ member, canEdit, isOwner }: { member: Member; canEdit: boolean; isOwner: boolean }) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [grant, setGrant] = useState<Set<string>>(new Set(member.permissionOverrides.grant));
  const [deny, setDeny] = useState<Set<string>>(new Set(member.permissionOverrides.deny));

  const { data: catalogue } = useQuery({
    queryKey: ['permissionCatalogue'],
    queryFn: () => api<{ groups: string[]; permissions: PermissionDefinition[] }>('/villas/permissions'),
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/members/${member.id}/permissions`, {
        method: 'PUT',
        body: { grant: [...grant], deny: [...deny] },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['members', villa.id] }),
  });

  const effective = useMemo(() => new Set(member.effectivePermissions), [member.effectivePermissions]);
  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const permission of catalogue?.permissions ?? []) {
      map.set(permission.group, [...(map.get(permission.group) ?? []), permission]);
    }
    return map;
  }, [catalogue]);

  if (!catalogue) return <Spinner />;

  if (member.role.isOwner) {
    return (
      <p className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        The owner always holds every permission.
      </p>
    );
  }

  /** Cycles a permission through role default → granted → denied. */
  function cycle(key: string) {
    const fromRole = effective.has(key) && !grant.has(key);
    const nextGrant = new Set(grant);
    const nextDeny = new Set(deny);
    if (deny.has(key)) {
      nextDeny.delete(key);
    } else if (grant.has(key)) {
      nextGrant.delete(key);
      nextDeny.add(key);
    } else if (fromRole) {
      nextDeny.add(key);
    } else {
      nextGrant.add(key);
    }
    setGrant(nextGrant);
    setDeny(nextDeny);
  }

  const dirty =
    [...grant].sort().join() !== [...member.permissionOverrides.grant].sort().join() ||
    [...deny].sort().join() !== [...member.permissionOverrides.deny].sort().join();

  return (
    <div className="space-y-5">
      <p className="rounded-lg bg-sand-100 px-3 py-2 text-sm text-slate-700">
        {member.fullName} has the <span className="font-medium">{member.role.name}</span> role. Add exceptions
        here to grant or remove individual permissions just for them.
      </p>
      <ErrorNote message={save.error instanceof ApiError ? save.error.message : null} />

      {catalogue.groups.map((group) => {
        const permissions = grouped.get(group) ?? [];
        if (permissions.length === 0) return null;
        return (
          <div key={group}>
            <h3 className="mb-2 text-sm font-semibold text-slate-800">{group}</h3>
            <ul className="divide-y divide-sand-100 rounded-lg border border-sand-200">
              {permissions.map((permission) => {
                const granted = grant.has(permission.key);
                const denied = deny.has(permission.key);
                const fromRole = effective.has(permission.key) && !granted;
                const state = denied ? 'Denied' : granted ? 'Granted' : fromRole ? 'From role' : 'Not granted';
                const tone = denied
                  ? 'bg-red-100 text-red-800'
                  : granted
                    ? 'bg-emerald-100 text-emerald-800'
                    : fromRole
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-slate-50 text-slate-400';
                return (
                  <li key={permission.key} className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-slate-800">{permission.label}</p>
                      <p className="truncate text-xs text-slate-500">{permission.description}</p>
                    </div>
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => cycle(permission.key)}
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed ${tone}`}
                    >
                      {state}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      {canEdit && (
        <div className="flex justify-end gap-2 border-t border-sand-100 pt-4">
          <Button
            variant="secondary"
            onClick={() => {
              setGrant(new Set(member.permissionOverrides.grant));
              setDeny(new Set(member.permissionOverrides.deny));
            }}
            disabled={!dirty}
          >
            Reset
          </Button>
          <Button loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
            Save exceptions
          </Button>
        </div>
      )}
      {!canEdit && !isOwner && (
        <p className="text-xs text-slate-500">You need the "Manage roles and permissions" permission to change this.</p>
      )}
    </div>
  );
}
