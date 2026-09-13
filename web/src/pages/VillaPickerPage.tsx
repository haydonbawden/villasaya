import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.tsx';
import { ApiError, api } from '../lib/api.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { Avatar, Button, EmptyState, ErrorNote, Field, Modal } from '../components/ui.tsx';

/** Landing page for someone in more than one villa, and the "add a villa" entry point. */
export function VillaPickerPage() {
  usePageTitle('Your villas', null);
  const { user, villas, logout, refreshVillas } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);

  return (
    <div className="min-h-screen">
      <header className="border-b border-sand-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-sm font-semibold uppercase tracking-widest text-brand-700">
            Villa Saya
          </span>
          <div className="flex items-center gap-3">
            <Link to="/account" className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-sand-100">
              <Avatar name={user?.fullName ?? ''} colour={user?.avatarColour} size="sm" />
              <span className="hidden text-sm font-medium text-slate-700 sm:inline">{user?.fullName}</span>
            </Link>
            <Button variant="ghost" onClick={() => void logout()}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Your villas</h1>
            <p className="mt-1 text-sm text-slate-600">Pick a workspace to open.</p>
          </div>
          <Button onClick={() => setCreating(true)}>Add a villa</Button>
        </div>

        {villas.length === 0 ? (
          <div className="mt-8">
            <EmptyState
              title="You're not in a villa workspace yet"
              description="Create one to start managing staff, or ask a villa owner to send you an invitation."
              action={<Button onClick={() => setCreating(true)}>Create a villa</Button>}
            />
          </div>
        ) : (
          <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {villas.map((villa) => (
              <li key={villa.id}>
                <Link
                  to={`/villas/${villa.id}`}
                  className="card block h-full p-5 transition hover:border-brand-400 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-semibold text-slate-900">{villa.name}</h2>
                    {villa.role.isOwner && (
                      <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-800">
                        Owner
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{villa.role.name}</p>
                  <p className="mt-4 text-xs text-slate-500">
                    {villa.memberCount ?? 0} {villa.memberCount === 1 ? 'person' : 'people'} · {villa.currency} ·{' '}
                    {villa.timezone}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>

      {creating && (
        <CreateVillaModal
          onClose={() => setCreating(false)}
          onCreated={async (villaId) => {
            await refreshVillas();
            navigate(`/villas/${villaId}`);
          }}
        />
      )}
    </div>
  );
}

function CreateVillaModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (villaId: string) => void | Promise<void>;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Asia/Makassar');
  const [currency, setCurrency] = useState('IDR');

  const mutation = useMutation({
    mutationFn: () =>
      api<{ villa: { id: string } }>('/villas', {
        body: { name, address: address || undefined, timezone, currency },
      }),
    onSuccess: (result) => void onCreated(result.villa.id),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <Modal title="Add a villa" description="Each villa is a separate workspace with its own staff." onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={mutation.error instanceof ApiError ? mutation.error.message : null} />
        <Field label="Villa name">
          <input className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Address (optional)">
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Timezone">
            <select className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              <option value="Asia/Makassar">Bali (WITA)</option>
              <option value="Asia/Jakarta">Jakarta (WIB)</option>
              <option value="Asia/Jayapura">Papua (WIT)</option>
              <option value="Asia/Singapore">Singapore</option>
              <option value="Australia/Sydney">Sydney</option>
            </select>
          </Field>
          <Field label="Currency">
            <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="IDR">IDR — Rupiah</option>
              <option value="USD">USD — US Dollar</option>
              <option value="AUD">AUD — Australian Dollar</option>
              <option value="EUR">EUR — Euro</option>
              <option value="SGD">SGD — Singapore Dollar</option>
            </select>
          </Field>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={mutation.isPending}>
            Create villa
          </Button>
        </div>
      </form>
    </Modal>
  );
}
