import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../lib/api.ts';
import { useVilla } from '../context/VillaContext.tsx';
import { PageHeader } from '../components/PageHeader.tsx';
import { Button, ErrorNote, Field, Modal, Spinner, Toggle } from '../components/ui.tsx';
import type { PermissionDefinition, Role } from '../lib/types.ts';

/**
 * The permission matrix. Everything an owner can grant lives in one place, and
 * saving writes the whole permission array for the role — no partial state to
 * reconcile, and the effect is visible immediately in the member list.
 */
export function RolesPage() {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Set<string> | null>(null);

  const { data: catalogue } = useQuery({
    queryKey: ['permissionCatalogue'],
    queryFn: () => api<{ groups: string[]; permissions: PermissionDefinition[] }>('/villas/permissions'),
    staleTime: Infinity,
  });

  const { data, isPending } = useQuery({
    queryKey: ['roles', villa.id],
    queryFn: () => api<{ roles: Role[] }>(`/villas/${villa.id}/roles`),
  });

  const roles = data?.roles ?? [];
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0];

  const save = useMutation({
    mutationFn: (permissions: string[]) =>
      api(`/villas/${villa.id}/roles/${selected?.id}`, { method: 'PATCH', body: { permissions } }),
    onSuccess: () => {
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: ['roles', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['villa', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['members', villa.id] });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDefinition[]>();
    for (const permission of catalogue?.permissions ?? []) {
      map.set(permission.group, [...(map.get(permission.group) ?? []), permission]);
    }
    return map;
  }, [catalogue]);

  if (isPending || !catalogue) return <Spinner label="Loading roles" />;

  const current = draft ?? new Set(selected?.permissions ?? []);
  const dirty = draft !== null;

  function toggle(key: string) {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setDraft(next);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Roles & permissions"
        description="Decide exactly what each role can see and do in this villa."
        actions={<Button onClick={() => setCreating(true)}>New role</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside>
          <ul className="space-y-1">
            {roles.map((role) => (
              <li key={role.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(role.id);
                    setDraft(null);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                    role.id === selected?.id
                      ? 'bg-brand-50 font-medium text-brand-900'
                      : 'text-slate-700 hover:bg-sand-100'
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: role.colour }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{role.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-400">{role.memberCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {selected && (
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-sand-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">{selected.name}</h2>
                {selected.description && <p className="mt-1 text-sm text-slate-600">{selected.description}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  {selected.memberCount} {selected.memberCount === 1 ? 'person holds' : 'people hold'} this role
                  {selected.isSystem && ' · built-in role'}
                </p>
              </div>
              {dirty && (
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDraft(null)}>
                    Discard
                  </Button>
                  <Button loading={save.isPending} onClick={() => save.mutate([...current])}>
                    Save changes
                  </Button>
                </div>
              )}
            </div>

            {save.error instanceof ApiError && (
              <div className="mt-4">
                <ErrorNote message={save.error.message} />
              </div>
            )}

            {selected.isOwner ? (
              <p className="mt-5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
                The owner always holds every permission. This is deliberate: it guarantees there is always one
                account that can repair a misconfigured workspace. To limit someone, give them a different role.
              </p>
            ) : (
              <div className="mt-5 space-y-6">
                {catalogue.groups.map((group) => {
                  const permissions = grouped.get(group) ?? [];
                  if (permissions.length === 0) return null;
                  const allOn = permissions.every((permission) => current.has(permission.key));
                  return (
                    <div key={group}>
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-800">{group}</h3>
                        <button
                          type="button"
                          className="text-xs font-medium text-brand-700 hover:underline"
                          onClick={() => {
                            const next = new Set(current);
                            for (const permission of permissions) {
                              if (allOn) next.delete(permission.key);
                              else next.add(permission.key);
                            }
                            setDraft(next);
                          }}
                        >
                          {allOn ? 'Clear all' : 'Select all'}
                        </button>
                      </div>
                      <ul className="divide-y divide-sand-100 rounded-lg border border-sand-200">
                        {permissions.map((permission) => (
                          <li key={permission.key} className="flex items-start gap-3 px-3 py-2.5">
                            <Toggle
                              checked={current.has(permission.key)}
                              onChange={() => toggle(permission.key)}
                              label={permission.label}
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">
                                {permission.label}
                                {permission.elevated && (
                                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                                    Elevated
                                  </span>
                                )}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">{permission.description}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {!selected.isSystem && (
              <DeleteRole role={selected} roles={roles} onDeleted={() => setSelectedId(null)} />
            )}
          </section>
        )}
      </div>

      {creating && <CreateRoleModal roles={roles} onClose={() => setCreating(false)} />}
    </div>
  );
}

function DeleteRole({ role, roles, onDeleted }: { role: Role; roles: Role[]; onDeleted: () => void }) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [reassignTo, setReassignTo] = useState('');

  const remove = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/roles/${role.id}`, {
        method: 'DELETE',
        body: { reassignToRoleId: reassignTo || undefined },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles', villa.id] });
      void queryClient.invalidateQueries({ queryKey: ['members', villa.id] });
      onDeleted();
    },
  });

  const alternatives = roles.filter((candidate) => candidate.id !== role.id && !candidate.isOwner);

  return (
    <div className="mt-8 border-t border-sand-100 pt-4">
      <ErrorNote message={remove.error instanceof ApiError ? remove.error.message : null} />
      <div className="mt-2 flex flex-wrap items-end gap-3">
        {role.memberCount > 0 && (
          <Field label={`Move ${role.memberCount} person to`}>
            <select className="input" value={reassignTo} onChange={(event) => setReassignTo(event.target.value)}>
              <option value="">Choose a role…</option>
              {alternatives.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Button
          variant="danger"
          loading={remove.isPending}
          disabled={role.memberCount > 0 && !reassignTo}
          onClick={() => remove.mutate()}
        >
          Delete role
        </Button>
      </div>
    </div>
  );
}

function CreateRoleModal({ roles, onClose }: { roles: Role[]; onClose: () => void }) {
  const { villa } = useVilla();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [copyFrom, setCopyFrom] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api(`/villas/${villa.id}/roles`, {
        body: { name, description: description || undefined, copyFromRoleId: copyFrom || undefined },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['roles', villa.id] });
      onClose();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal
      title="New role"
      description="Start from an existing role, then tune the permissions."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        <Field label="Role name">
          <input
            className="input"
            required
            autoFocus
            placeholder="Head Gardener"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field label="Description (optional)">
          <input
            className="input"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Copy permissions from" hint="You can change every permission afterwards.">
          <select className="input" value={copyFrom} onChange={(event) => setCopyFrom(event.target.value)}>
            <option value="">Start with nothing</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create role
          </Button>
        </div>
      </form>
    </Modal>
  );
}
