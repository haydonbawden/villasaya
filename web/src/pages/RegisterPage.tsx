import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.tsx';
import { ApiError } from '../lib/api.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { Button, ErrorNote, Field } from '../components/ui.tsx';
import { AuthShell } from '../components/AuthShell.tsx';

export function RegisterPage() {
  usePageTitle('Create your workspace', null);
  const { register } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', villaName: '' });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    setBusy(true);
    try {
      await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        ...(form.phone ? { phone: form.phone } : {}),
        // Creating the first villa here is what makes this an owner signup;
        // staff arrive through an invitation instead.
        ...(form.villaName ? { villaName: form.villaName } : {}),
      });
    } catch (caught) {
      if (caught instanceof ApiError) {
        setError(caught.message);
        setFieldErrors(caught.fieldErrors);
      } else {
        setError('Could not create your account. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Set up an owner account and your first villa."
      footer={
        <p className="text-sm text-slate-600">
          Already have an account?{' '}
          <Link className="font-medium text-brand-700 hover:underline" to="/login">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={error} />
        <Field label="Your name" error={fieldErrors.fullName}>
          <input className="input" required value={form.fullName} onChange={(e) => update('fullName', e.target.value)} />
        </Field>
        <Field label="Email address" error={fieldErrors.email}>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </Field>
        <Field label="Phone (optional)" error={fieldErrors.phone}>
          <input className="input" type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </Field>
        <Field
          label="Password"
          error={fieldErrors.password}
          hint="At least 10 characters. A short phrase you'll remember works well."
        >
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={form.password}
            onChange={(e) => update('password', e.target.value)}
          />
        </Field>
        <Field
          label="Villa name"
          error={fieldErrors.villaName}
          hint="You can add more villas later, and rename this one any time."
        >
          <input
            className="input"
            placeholder="Villa Melati"
            required
            value={form.villaName}
            onChange={(e) => update('villaName', e.target.value)}
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
