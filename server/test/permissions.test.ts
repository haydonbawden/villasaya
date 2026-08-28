import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, setRolePermissions, startTestServer, type Actor } from './helpers.ts';
import { resolvePermissions } from '../src/permissions.ts';

const { url, close } = await startTestServer();
after(close);

describe('permission resolution', () => {
  it('expands the owner wildcard to every permission', () => {
    const effective = resolvePermissions(['*'], { grant: [], deny: [] });
    assert.ok(effective.has('expenses:approve'));
    assert.ok(effective.has('villa:delete'));
  });

  it('adds per-member grants on top of the role', () => {
    const effective = resolvePermissions(['tasks:view.own'], { grant: ['expenses:approve'], deny: [] });
    assert.ok(effective.has('tasks:view.own'));
    assert.ok(effective.has('expenses:approve'));
  });

  it('lets a denial beat both the role and the wildcard', () => {
    const fromRole = resolvePermissions(['tasks:view.all', 'tasks:delete'], { grant: [], deny: ['tasks:delete'] });
    assert.ok(fromRole.has('tasks:view.all'));
    assert.ok(!fromRole.has('tasks:delete'));

    // A wildcard holder with a denial keeps everything else but loses that one.
    const fromWildcard = resolvePermissions(['*'], { grant: [], deny: ['villa:delete'] });
    assert.ok(!fromWildcard.has('villa:delete'));
    assert.ok(!fromWildcard.has('*'), 'the wildcard itself must not survive a denial');
    assert.ok(fromWildcard.has('expenses:approve'));
  });

  it('lets a denial beat a grant for the same key', () => {
    const effective = resolvePermissions([], { grant: ['expenses:approve'], deny: ['expenses:approve'] });
    assert.ok(!effective.has('expenses:approve'));
  });

  it('ignores permission keys that are not in the catalogue', () => {
    const effective = resolvePermissions(['tasks:view.own'], { grant: ['not:a:real:permission'], deny: [] });
    assert.ok(!effective.has('not:a:real:permission'));
  });
});

describe('permission enforcement over the API', () => {
  let owner: Actor & { villaId: string; membershipId: string };
  let staff: Actor & { membershipId: string };
  let manager: Actor & { membershipId: string };

  before(async () => {
    owner = await createOwner(url, { email: 'owner@villa.test', villaName: 'Villa Kenari', fullName: 'Wayan' });
    staff = await addStaff(url, owner, { email: 'staff@villa.test', fullName: 'Ketut' });
    manager = await addStaff(url, owner, { email: 'manager@villa.test', roleKey: 'manager', fullName: 'Made' });
  });

  it('reports the caller their own effective permissions', async () => {
    const response = await staff.client.get<{ me: { permissions: string[] } }>(`/villas/${owner.villaId}`);
    assert.ok(response.body.me.permissions.includes('expenses:submit'));
    assert.ok(!response.body.me.permissions.includes('expenses:approve'));
  });

  it('refuses an action the role does not carry', async () => {
    const response = await staff.client.post(`/villas/${owner.villaId}/invitations`, {
      email: 'someone@villa.test',
      roleId: 'whatever',
    });
    assert.equal(response.status, 403);
    assert.equal((response.body as { error: { code: string } }).error.code, 'forbidden');
  });

  it('hides pay details from anyone without members:view_sensitive', async () => {
    const asStaff = await staff.client.get<{ members: Array<{ payRateMinor?: number }> }>(
      `/villas/${owner.villaId}/members`,
    );
    assert.ok(asStaff.body.members.every((member) => member.payRateMinor === undefined));

    const asManager = await manager.client.get<{ members: Array<Record<string, unknown>> }>(
      `/villas/${owner.villaId}/members`,
    );
    assert.ok(asManager.body.members.every((member) => 'payRateMinor' in member));
  });

  it('applies a role permission change immediately', async () => {
    const before = await staff.client.get(`/villas/${owner.villaId}/reports/expenses?from=2026-01-01&to=2026-12-31`);
    assert.equal(before.status, 403);

    await setRolePermissions(owner, 'staff', [
      'villa:view',
      'members:view',
      'expenses:view.own',
      'expenses:submit',
      'reports:view',
    ]);

    const after = await staff.client.get(`/villas/${owner.villaId}/reports/expenses?from=2026-01-01&to=2026-12-31`);
    assert.equal(after.status, 200, 'the new permission should take effect on the very next request');
  });

  it('grants an individual an exception without changing their role', async () => {
    const denied = await staff.client.get(`/villas/${owner.villaId}/audit`);
    assert.equal(denied.status, 403);

    const saved = await owner.client.put(`/villas/${owner.villaId}/members/${staff.membershipId}/permissions`, {
      grant: ['audit:view'],
      deny: [],
    });
    assert.equal(saved.status, 200);

    assert.equal((await staff.client.get(`/villas/${owner.villaId}/audit`)).status, 200);

    // Their colleagues on the same role are unaffected.
    const other = await addStaff(url, owner, { email: 'other-staff@villa.test' });
    assert.equal((await other.client.get(`/villas/${owner.villaId}/audit`)).status, 403);
  });

  it('removes a capability from one person with a denial', async () => {
    assert.equal(
      (await manager.client.get(`/villas/${owner.villaId}/expenses`)).status,
      200,
    );
    await owner.client.put(`/villas/${owner.villaId}/members/${manager.membershipId}/permissions`, {
      grant: [],
      deny: ['expenses:view.all', 'expenses:view.own'],
    });
    const response = await manager.client.get(`/villas/${owner.villaId}/expenses`);
    assert.equal(response.status, 403);

    // Restore for the tests that follow.
    await owner.client.put(`/villas/${owner.villaId}/members/${manager.membershipId}/permissions`, {
      grant: [],
      deny: [],
    });
  });

  it('rejects a permission key that does not exist', async () => {
    const response = await owner.client.put(`/villas/${owner.villaId}/members/${staff.membershipId}/permissions`, {
      grant: ['villa:take_over_the_world'],
      deny: [],
    });
    assert.equal(response.status, 400);
  });

  it('refuses to grant and deny the same permission at once', async () => {
    const response = await owner.client.put(`/villas/${owner.villaId}/members/${staff.membershipId}/permissions`, {
      grant: ['tasks:delete'],
      deny: ['tasks:delete'],
    });
    assert.equal(response.status, 400);
  });

  it('never narrows the owner role, so a villa cannot be locked out', async () => {
    const roles = await owner.client.get<{ roles: Array<{ id: string; isOwner: boolean }> }>(
      `/villas/${owner.villaId}/roles`,
    );
    const ownerRole = roles.body.roles.find((role) => role.isOwner)!;
    const response = await owner.client.patch(`/villas/${owner.villaId}/roles/${ownerRole.id}`, {
      permissions: ['villa:view'],
    });
    assert.equal(response.status, 403);

    const ownerMembership = await owner.client.put(
      `/villas/${owner.villaId}/members/${owner.membershipId}/permissions`,
      { grant: [], deny: ['villa:delete'] },
    );
    assert.equal(ownerMembership.status, 403);
  });

  it('will not create a role that holds the wildcard', async () => {
    const roles = await owner.client.get<{ roles: Array<{ id: string; isOwner: boolean }> }>(
      `/villas/${owner.villaId}/roles`,
    );
    const ownerRole = roles.body.roles.find((role) => role.isOwner)!;
    const created = await owner.client.post<{ role: { permissions: string[] } }>(`/villas/${owner.villaId}/roles`, {
      name: 'Deputy Owner',
      copyFromRoleId: ownerRole.id,
    });
    assert.equal(created.status, 201);
    // Copying the owner yields concrete permissions, never the wildcard, so the
    // role can be narrowed later.
    assert.ok(!created.body.role.permissions.includes('*'));
    assert.ok(created.body.role.permissions.includes('expenses:approve'));
  });

  it('moves staff to another role before deleting the one they hold', async () => {
    const created = await owner.client.post<{ role: { id: string } }>(`/villas/${owner.villaId}/roles`, {
      name: 'Gardener',
      permissions: ['villa:view', 'tasks:view.own'],
    });
    const roleId = created.body.role.id;
    const gardener = await addStaff(url, owner, { email: 'gardener@villa.test' });
    await owner.client.patch(`/villas/${owner.villaId}/members/${gardener.membershipId}`, { roleId });

    const blocked = await owner.client.delete(`/villas/${owner.villaId}/roles/${roleId}`);
    assert.equal(blocked.status, 409, 'deleting an occupied role needs somewhere for its members to go');

    const roles = await owner.client.get<{ roles: Array<{ id: string; key: string }> }>(
      `/villas/${owner.villaId}/roles`,
    );
    const staffRole = roles.body.roles.find((role) => role.key === 'staff')!;
    const deleted = await owner.client.delete(`/villas/${owner.villaId}/roles/${roleId}`, {
      reassignToRoleId: staffRole.id,
    });
    assert.equal(deleted.status, 204);

    const member = await owner.client.get<{ member: { role: { key: string } } }>(
      `/villas/${owner.villaId}/members/${gardener.membershipId}`,
    );
    assert.equal(member.body.member.role.key, 'staff');
  });

  it('will not delete a built-in role', async () => {
    const roles = await owner.client.get<{ roles: Array<{ id: string; key: string }> }>(
      `/villas/${owner.villaId}/roles`,
    );
    const staffRole = roles.body.roles.find((role) => role.key === 'staff')!;
    const response = await owner.client.delete(`/villas/${owner.villaId}/roles/${staffRole.id}`);
    assert.equal(response.status, 403);
  });
});
