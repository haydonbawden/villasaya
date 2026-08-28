import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ApiError, api, setAccessToken } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { Avatar, Button, ErrorNote, Field } from '../components/ui.tsx';
import type { User } from '../lib/types.ts';

export function AccountPage() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState({
    fullName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    locale: user?.locale ?? 'en',
  });
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [passwordDone, setPasswordDone] = useState(false);

  const saveProfile = useMutation({
    mutationFn: () =>
      api<{ user: User }>('/auth/me', {
        method: 'PATCH',
        body: { fullName: profile.fullName, phone: profile.phone || null, locale: profile.locale },
      }),
    onSuccess: (result) => updateUser(result.user),
  });

  const changePassword = useMutation({
    mutationFn: () =>
      api<{ accessToken: string }>('/auth/change-password', {
        body: { currentPassword: passwords.current, newPassword: passwords.next },
      }),
    onSuccess: (result) => {
      // Changing the password revokes every other session, so the caller is
      // handed a fresh token rather than being bounced to sign-in.
      setAccessToken(result.accessToken);
      setPasswords({ current: '', next: '' });
      setPasswordDone(true);
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-5 py-10">
      <Link to="/" className="text-sm text-brand-700 hover:underline">
        ← Back to your villas
      </Link>

      <div className="mt-6 flex items-center gap-4">
        <Avatar name={user?.fullName ?? ''} colour={user?.avatarColour} size="lg" />
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{user?.fullName}</h1>
          <p className="text-sm text-slate-600">{user?.email}</p>
        </div>
      </div>

      <form
        className="card mt-8 space-y-4 p-5"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          saveProfile.mutate();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Your details</h2>
        <ErrorNote message={saveProfile.error instanceof ApiError ? saveProfile.error.message : null} />
        <Field label="Full name">
          <input
            className="input"
            value={profile.fullName}
            onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <input
            className="input"
            type="tel"
            value={profile.phone}
            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
          />
        </Field>
        <Field label="Language">
          <select
            className="input"
            value={profile.locale}
            onChange={(e) => setProfile({ ...profile, locale: e.target.value })}
          >
            <option value="en">English</option>
            <option value="id">Bahasa Indonesia</option>
          </select>
        </Field>
        <div className="flex items-center justify-end gap-3">
          {saveProfile.isSuccess && <span className="text-sm text-emerald-700">Saved</span>}
          <Button type="submit" loading={saveProfile.isPending}>
            Save
          </Button>
        </div>
      </form>

      <form
        className="card mt-6 space-y-4 p-5"
        noValidate
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          setPasswordDone(false);
          changePassword.mutate();
        }}
      >
        <h2 className="text-sm font-semibold text-slate-900">Change password</h2>
        <ErrorNote message={changePassword.error instanceof ApiError ? changePassword.error.message : null} />
        <Field label="Current password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={passwords.current}
            onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
          />
        </Field>
        <Field label="New password" hint="At least 10 characters. Signs you out on every other device.">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={passwords.next}
            onChange={(e) => setPasswords({ ...passwords, next: e.target.value })}
          />
        </Field>
        <div className="flex items-center justify-end gap-3">
          {passwordDone && <span className="text-sm text-emerald-700">Password updated</span>}
          <Button type="submit" loading={changePassword.isPending}>
            Update password
          </Button>
        </div>
      </form>
    </div>
  );
}
