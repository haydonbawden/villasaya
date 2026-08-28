import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, startTestServer, type Actor } from './helpers.ts';

const { url, close } = await startTestServer();
after(close);

/**
 * Tenant isolation is the property everything else rests on: a villa's data
 * must be unreachable to anyone without a membership in it, even when they
 * hold every permission in their own villa.
 */
describe('multi-tenant isolation', () => {
  let alice: Actor & { villaId: string };
  let bob: Actor & { villaId: string };

  before(async () => {
    alice = await createOwner(url, { email: 'alice@example.com', villaName: 'Villa Alpha' });
    bob = await createOwner(url, { email: 'bob@example.com', villaName: 'Villa Beta' });
  });

  it("reports another owner's villa as not found, rather than forbidden", async () => {
    const response = await bob.client.get(`/villas/${alice.villaId}`);
    // 404 rather than 403: a 403 would confirm the villa id exists.
    assert.equal(response.status, 404);
  });

  it('hides every tenant-scoped collection from a non-member', async () => {
    for (const path of ['members', 'tasks', 'roster', 'leave', 'expenses', 'messages/channels', 'roles']) {
      const response = await bob.client.get(`/villas/${alice.villaId}/${path}`);
      assert.equal(response.status, 404, `${path} should be unreachable, got ${response.status}`);
    }
  });

  it('lists only the villas a user belongs to', async () => {
    const response = await alice.client.get<{ villas: Array<{ id: string }> }>('/villas');
    assert.equal(response.body.villas.length, 1);
    assert.equal(response.body.villas[0]?.id, alice.villaId);
  });

  it('keeps records in separate villas invisible to each other', async () => {
    const created = await alice.client.post<{ task: { id: string } }>(`/villas/${alice.villaId}/tasks`, {
      title: 'Alpha-only task',
    });
    assert.equal(created.status, 201);

    const direct = await bob.client.get(`/villas/${alice.villaId}/tasks/${created.body.task.id}`);
    assert.equal(direct.status, 404);

    // The same id addressed through Bob's own villa must not resolve either.
    const crossed = await bob.client.get(`/villas/${bob.villaId}/tasks/${created.body.task.id}`);
    assert.equal(crossed.status, 404);
  });

  it('does not let a member of one villa be assigned work in another', async () => {
    const outsider = await addStaff(url, bob, { email: 'beta-staff@example.com' });
    const response = await alice.client.post(`/villas/${alice.villaId}/tasks`, {
      title: 'Cross-tenant assignment',
      assigneeIds: [outsider.membershipId],
    });
    assert.equal(response.status, 400);
  });

  it('rejects a request with no credentials', async () => {
    const anonymous = await fetch(`${url}/api/villas/${alice.villaId}/members`);
    assert.equal(anonymous.status, 401);
  });

  it('stops a removed member from reading the villa', async () => {
    const staff = await addStaff(url, alice, { email: 'leaving@example.com' });
    assert.equal((await staff.client.get(`/villas/${alice.villaId}`)).status, 200);

    const removal = await alice.client.delete(`/villas/${alice.villaId}/members/${staff.membershipId}`);
    assert.equal(removal.status, 204);

    // The access token is still valid, but the membership behind it is gone.
    assert.equal((await staff.client.get(`/villas/${alice.villaId}`)).status, 404);
  });

  it('blocks a suspended member while keeping their records', async () => {
    const staff = await addStaff(url, alice, { email: 'suspended@example.com' });
    await alice.client.patch(`/villas/${alice.villaId}/members/${staff.membershipId}`, { status: 'suspended' });

    const response = await staff.client.get(`/villas/${alice.villaId}`);
    assert.equal(response.status, 403);

    const members = await alice.client.get<{ members: Array<{ email: string }> }>(
      `/villas/${alice.villaId}/members?includeInactive=true`,
    );
    assert.ok(members.body.members.some((member) => member.email === 'suspended@example.com'));
  });
});
