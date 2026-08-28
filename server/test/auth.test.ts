import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { Client, addStaff, createOwner, startTestServer, type Actor } from './helpers.ts';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../src/auth/password.ts';

const { url, close } = await startTestServer();
after(close);

describe('password handling', () => {
  it('produces a different hash for the same password each time', async () => {
    const first = await hashPassword('a-perfectly-fine-passphrase');
    const second = await hashPassword('a-perfectly-fine-passphrase');
    assert.notEqual(first, second, 'the salt must differ');
    assert.ok(await verifyPassword('a-perfectly-fine-passphrase', first));
    assert.ok(await verifyPassword('a-perfectly-fine-passphrase', second));
  });

  it('rejects the wrong password and malformed hashes', async () => {
    const hash = await hashPassword('the-right-passphrase');
    assert.ok(!(await verifyPassword('the-wrong-passphrase', hash)));
    assert.ok(!(await verifyPassword('anything', 'not-a-real-hash')));
    assert.ok(!(await verifyPassword('anything', '')));
  });

  it('never stores the password itself', async () => {
    const hash = await hashPassword('super-secret-phrase');
    assert.ok(!hash.includes('super-secret-phrase'));
    assert.ok(hash.startsWith('scrypt$'));
  });

  it('turns away passwords that are too short or too obvious', () => {
    assert.ok(checkPasswordStrength('short'));
    assert.ok(checkPasswordStrength('password123'));
    assert.ok(checkPasswordStrength('aaaaaaaaaaaa'));
    assert.equal(checkPasswordStrength('kembang sepatu di kebun'), null);
  });
});

describe('sessions', () => {
  let owner: Actor & { villaId: string };

  before(async () => {
    owner = await createOwner(url, { email: 'session@villa.test', villaName: 'Villa Session' });
  });

  it('gives the same answer whether or not the email exists', async () => {
    const client = new Client(url);
    const unknownAccount = await client.post('/auth/login', {
      email: 'nobody@villa.test',
      password: 'some-passphrase-here',
    });
    const wrongPassword = await client.post('/auth/login', {
      email: 'session@villa.test',
      password: 'some-passphrase-here',
    });
    assert.equal(unknownAccount.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(
      (unknownAccount.body as { error: { message: string } }).error.message,
      (wrongPassword.body as { error: { message: string } }).error.message,
    );
  });

  it('rotates the refresh token on every use', async () => {
    const client = new Client(url);
    await client.post('/auth/login', { email: 'session@villa.test', password: 'test-passphrase-2026' });
    const first = client.getCookie('villa_refresh');

    const refreshed = await client.post('/auth/refresh');
    assert.equal(refreshed.status, 200);
    const second = client.getCookie('villa_refresh');
    assert.ok(first && second && first !== second, 'a used refresh token must not be reissued');
  });

  it('tolerates two refreshes racing on the same token', async () => {
    const client = new Client(url);
    await client.post('/auth/login', { email: 'session@villa.test', password: 'test-passphrase-2026' });
    const shared = client.getCookie('villa_refresh')!;

    // Two tabs, or React StrictMode's double effect, present the same token.
    const a = new Client(url);
    a.setCookie('villa_refresh', shared);
    const b = new Client(url);
    b.setCookie('villa_refresh', shared);

    const [first, second] = await Promise.all([a.post('/auth/refresh'), b.post('/auth/refresh')]);
    assert.equal(first.status, 200);
    assert.equal(second.status, 200, 'a concurrent refresh must not destroy the session');

    // The session still works afterwards.
    assert.equal((await a.post('/auth/refresh')).status, 200);
  });

  it('kills the whole session family when an old token is replayed', async () => {
    const client = new Client(url);
    await client.post('/auth/login', { email: 'session@villa.test', password: 'test-passphrase-2026' });
    const stolen = client.getCookie('villa_refresh')!;

    // Rotate several times so the stolen token is well outside the grace window
    // by every measure except elapsed time, then age it past the window.
    await client.post('/auth/refresh');
    const { getDb } = await import('../src/db/index.ts');
    getDb()
      .prepare("UPDATE refresh_tokens SET revoked_at = datetime('now', '-10 minutes') WHERE revoked_at IS NOT NULL")
      .run();

    const attacker = new Client(url);
    attacker.setCookie('villa_refresh', stolen);
    const replay = await attacker.post('/auth/refresh');
    assert.equal(replay.status, 401);

    // The legitimate holder is signed out too — that is the point of reuse
    // detection: neither party keeps a session the attacker has seen.
    assert.equal((await client.post('/auth/refresh')).status, 401);
  });

  it('signs every device out when the password changes', async () => {
    const laptop = new Client(url);
    await laptop.post('/auth/login', { email: 'session@villa.test', password: 'test-passphrase-2026' });
    const phone = new Client(url);
    const phoneLogin = await phone.post<{ accessToken: string }>('/auth/login', {
      email: 'session@villa.test',
      password: 'test-passphrase-2026',
    });
    phone.setToken(phoneLogin.body.accessToken);

    const laptopLogin = await laptop.post<{ accessToken: string }>('/auth/login', {
      email: 'session@villa.test',
      password: 'test-passphrase-2026',
    });
    laptop.setToken(laptopLogin.body.accessToken);

    const changed = await laptop.post('/auth/change-password', {
      currentPassword: 'test-passphrase-2026',
      newPassword: 'a-brand-new-passphrase-2026',
    });
    assert.equal(changed.status, 200);

    // The phone's refresh token is gone; the laptop got a fresh one.
    assert.equal((await phone.post('/auth/refresh')).status, 401);
    assert.equal((await laptop.post('/auth/refresh')).status, 200);
  });

  it('rejects a tampered access token', async () => {
    const client = new Client(url);
    client.setToken('not.a.real.token');
    assert.equal((await client.get(`/villas/${owner.villaId}`)).status, 401);
  });

  it('rate-limits repeated failed sign-ins', async () => {
    const client = new Client(url);
    let sawRateLimit = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const response = await client.post('/auth/login', {
        email: 'bruteforce@villa.test',
        password: `guess-number-${attempt}`,
      });
      if (response.status === 429) {
        sawRateLimit = true;
        break;
      }
    }
    assert.ok(sawRateLimit, 'repeated failures should eventually be throttled');
  });
});

describe('invitations', () => {
  let owner: Actor & { villaId: string };
  let staffRoleId: string;

  before(async () => {
    owner = await createOwner(url, { email: 'inviter@villa.test', villaName: 'Villa Invite' });
    const roles = await owner.client.get<{ roles: Array<{ id: string; key: string }> }>(
      `/villas/${owner.villaId}/roles`,
    );
    staffRoleId = roles.body.roles.find((role) => role.key === 'staff')!.id;
  });

  it('lets an invited person register and land in the villa', async () => {
    const joined = await addStaff(url, owner, { email: 'newcomer@villa.test', fullName: 'Nyoman' });
    const villas = await joined.client.get<{ villas: Array<{ id: string }> }>('/villas');
    assert.equal(villas.body.villas.length, 1);
    assert.equal(villas.body.villas[0]?.id, owner.villaId);
  });

  it('exposes a public preview without revealing the token holder', async () => {
    const invitation = await owner.client.post<{ inviteLink: string }>(`/villas/${owner.villaId}/invitations`, {
      email: 'preview@villa.test',
      roleId: staffRoleId,
      jobTitle: 'Gardener',
    });
    const token = invitation.body.inviteLink.split('/').pop()!;

    const anonymous = new Client(url);
    const preview = await anonymous.get<{ villaName: string; roleName: string; hasAccount: boolean }>(
      `/auth/invitations/${token}`,
    );
    assert.equal(preview.status, 200);
    assert.equal(preview.body.villaName, 'Villa Invite');
    assert.equal(preview.body.roleName, 'Staff');
    assert.equal(preview.body.hasAccount, false);
  });

  it('refuses an invitation token used with a different email', async () => {
    const invitation = await owner.client.post<{ inviteLink: string }>(`/villas/${owner.villaId}/invitations`, {
      email: 'intended@villa.test',
      roleId: staffRoleId,
    });
    const token = invitation.body.inviteLink.split('/').pop()!;

    const impostor = new Client(url);
    const response = await impostor.post('/auth/register', {
      email: 'someone-else@villa.test',
      password: 'test-passphrase-2026',
      fullName: 'Impostor',
      invitationToken: token,
    });
    assert.equal(response.status, 400);
  });

  it('cannot use the same invitation twice', async () => {
    const invitation = await owner.client.post<{ inviteLink: string }>(`/villas/${owner.villaId}/invitations`, {
      email: 'oneshot@villa.test',
      roleId: staffRoleId,
    });
    const token = invitation.body.inviteLink.split('/').pop()!;

    const first = new Client(url);
    assert.equal(
      (await first.post('/auth/register', {
        email: 'oneshot@villa.test',
        password: 'test-passphrase-2026',
        fullName: 'One Shot',
        invitationToken: token,
      })).status,
      201,
    );

    const second = new Client(url);
    const replay = await second.get(`/auth/invitations/${token}`);
    assert.equal(replay.status, 409);
  });

  it('invalidates the old link when an invitation is resent', async () => {
    const invitation = await owner.client.post<{ invitation: { id: string }; inviteLink: string }>(
      `/villas/${owner.villaId}/invitations`,
      { email: 'resend@villa.test', roleId: staffRoleId },
    );
    const oldToken = invitation.body.inviteLink.split('/').pop()!;

    const resent = await owner.client.post<{ inviteLink: string }>(
      `/villas/${owner.villaId}/invitations/${invitation.body.invitation.id}/resend`,
    );
    const newToken = resent.body.inviteLink.split('/').pop()!;
    assert.notEqual(oldToken, newToken);

    const anonymous = new Client(url);
    assert.equal((await anonymous.get(`/auth/invitations/${oldToken}`)).status, 400);
    assert.equal((await anonymous.get(`/auth/invitations/${newToken}`)).status, 200);
  });

  it('refuses a revoked invitation', async () => {
    const invitation = await owner.client.post<{ invitation: { id: string }; inviteLink: string }>(
      `/villas/${owner.villaId}/invitations`,
      { email: 'revoked@villa.test', roleId: staffRoleId },
    );
    const token = invitation.body.inviteLink.split('/').pop()!;
    await owner.client.delete(`/villas/${owner.villaId}/invitations/${invitation.body.invitation.id}`);

    const anonymous = new Client(url);
    assert.equal((await anonymous.get(`/auth/invitations/${token}`)).status, 400);
  });

  it('will not invite someone straight into the owner role', async () => {
    const roles = await owner.client.get<{ roles: Array<{ id: string; isOwner: boolean }> }>(
      `/villas/${owner.villaId}/roles`,
    );
    const ownerRole = roles.body.roles.find((role) => role.isOwner)!;
    const response = await owner.client.post(`/villas/${owner.villaId}/invitations`, {
      email: 'usurper@villa.test',
      roleId: ownerRole.id,
    });
    assert.equal(response.status, 403);
  });

  it('will not invite an existing active member', async () => {
    const response = await owner.client.post(`/villas/${owner.villaId}/invitations`, {
      email: 'newcomer@villa.test',
      roleId: staffRoleId,
    });
    assert.equal(response.status, 409);
  });
});
