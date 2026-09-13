import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext.tsx';
import { ApiError, api } from '../lib/api.ts';
import { usePageTitle } from '../lib/usePageTitle.ts';
import { AuthShell } from '../components/AuthShell.tsx';
import { Button, ErrorNote, Field, Spinner } from '../components/ui.tsx';

type InvitePreview = {
  villaName: string;
  roleName: string;
  invitedBy: string;
  email: string;
  jobTitle: string | null;
  expiresAt: string;
  hasAccount: boolean;
};

/**
 * The single entry point for staff joining a villa. It covers three cases from
 * one link: already signed in as the invited person, has an account but is
 * signed out, and has no account at all.
 */
export function AcceptInvitePage() {
  usePageTitle('Accept invitation', null);
  const { token = '' } = useParams<{ token: string }>();
  const { user, status, register, refreshVillas } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isPending, error: loadError } = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<InvitePreview>(`/auth/invitations/${token}`, { skipRefresh: true }),
    retry: false,
  });

  // A signed-in user whose email matches the invitation joins immediately.
  const signedInAsInvitee = status === 'authenticated' && user?.email.toLowerCase() === data?.email.toLowerCase();

  useEffect(() => {
    if (!signedInAsInvitee || busy) return;
    setBusy(true);
    api<{ villaId: string }>(`/auth/invitations/${token}/accept`, { method: 'POST' })
      .then(async (result) => {
        await refreshVillas();
        navigate(`/villas/${result.villaId}`, { replace: true });
      })
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Could not accept this invitation.');
        setBusy(false);
      });
  }, [signedInAsInvitee, token, busy, navigate, refreshVillas]);

  if (isPending) {
    return (
      <AuthShell title="Checking your invitation">
        <Spinner label="One moment" />
      </AuthShell>
    );
  }

  if (loadError || !data) {
    return (
      <AuthShell title="This invitation isn't valid" subtitle="It may have expired or already been used.">
        <ErrorNote
          message={loadError instanceof ApiError ? loadError.message : 'We could not find that invitation.'}
        />
        <p className="mt-4 text-sm text-slate-600">
          Ask the villa owner to send you a new invitation, or{' '}
          <Link className="font-medium text-brand-700 hover:underline" to="/login">
            sign in
          </Link>{' '}
          if you already have an account.
        </p>
      </AuthShell>
    );
  }

  const summary = (
    <div className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
      <p className="text-sm text-brand-900">
        <span className="font-semibold">{data.invitedBy}</span> invited you to join{' '}
        <span className="font-semibold">{data.villaName}</span> as{' '}
        <span className="font-semibold">{data.jobTitle ?? data.roleName}</span>.
      </p>
      <p className="mt-1 text-xs text-brand-800/80">Invitation sent to {data.email}</p>
    </div>
  );

  if (signedInAsInvitee || busy) {
    return (
      <AuthShell title={`Joining ${data.villaName}`}>
        {summary}
        <ErrorNote message={error} />
        {!error && <Spinner label="Adding you to the workspace" />}
      </AuthShell>
    );
  }

  // Signed in as somebody else: joining would attach the villa to the wrong
  // account, so the mismatch is spelled out rather than silently failing.
  if (status === 'authenticated' && !signedInAsInvitee) {
    return (
      <AuthShell title="This invitation is for a different account">
        {summary}
        <p className="text-sm text-slate-600">
          You are signed in as <span className="font-medium">{user?.email}</span>, but this invitation was sent
          to <span className="font-medium">{data.email}</span>. Sign out and sign back in as that person to
          accept it.
        </p>
      </AuthShell>
    );
  }

  if (data.hasAccount) {
    return (
      <AuthShell title={`Join ${data.villaName}`} subtitle="Sign in to accept the invitation.">
        {summary}
        <Link className="btn-primary w-full" to={`/login?email=${encodeURIComponent(data.email)}&invite=${token}`}>
          Sign in to accept
        </Link>
      </AuthShell>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!data) return;
    setError(null);
    setBusy(true);
    try {
      await register({
        email: data.email,
        fullName,
        password,
        invitationToken: token,
      });
      await refreshVillas();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'Could not create your account.');
      setBusy(false);
    }
  }

  return (
    <AuthShell title={`Join ${data.villaName}`} subtitle="Create your account to get started.">
      {summary}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <ErrorNote message={error} />
        <Field label="Your name">
          <input className="input" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Email address" hint="Set by the invitation and can't be changed here.">
          <input className="input" value={data.email} disabled />
        </Field>
        <Field label="Choose a password" hint="At least 10 characters.">
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={busy} className="w-full">
          Create account and join
        </Button>
      </form>
    </AuthShell>
  );
}
