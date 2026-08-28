import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { ApiError } from '../lib/api.ts';
import { Button, ErrorNote, Field } from '../components/ui.tsx';
import { AuthShell } from '../components/AuthShell.tsx';

export function LoginPage() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const invitation = params.get('invite');

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      // The invite flow redirects itself once the session exists.
      if (invitation) window.location.assign(`/invite/${invitation}`);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your villa team."
      footer={
        <p className="text-sm text-slate-600">
          Don't have an account?{' '}
          <Link className="font-medium text-brand-700 hover:underline" to="/register">
            Create one
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={error} />
        <Field label="Email address">
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
