import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, setRolePermissions, startTestServer, type Actor } from './helpers.ts';

const { url, close } = await startTestServer();
after(close);

let owner: Actor & { villaId: string; membershipId: string };
let ketut: Actor & { membershipId: string };
let made: Actor & { membershipId: string };
let outsiderVilla: Actor & { villaId: string; membershipId: string };

before(async () => {
  owner = await createOwner(url, { email: 'owner@chat.test', villaName: 'Villa Chat', fullName: 'Wayan' });
  ketut = await addStaff(url, owner, { email: 'ketut@chat.test', fullName: 'Ketut' });
  made = await addStaff(url, owner, { email: 'made@chat.test', fullName: 'Made' });
  outsiderVilla = await createOwner(url, { email: 'outsider@chat.test', villaName: 'Other Villa' });
});

describe('channels', () => {
  it('puts every new member in the default channel', async () => {
    const response = await ketut.client.get<{ channels: Array<{ name: string; kind: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    assert.ok(response.body.channels.some((channel) => channel.name === 'general' && channel.kind === 'channel'));
  });

  it('carries a message between two members of the villa', async () => {
    const channels = await owner.client.get<{ channels: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    const general = channels.body.channels.find((channel) => channel.name === 'general')!;

    const sent = await owner.client.post(`/villas/${owner.villaId}/messages/channels/${general.id}/messages`, {
      body: 'Guests arrive at 2pm.',
    });
    assert.equal(sent.status, 201);

    const received = await ketut.client.get<{ messages: Array<{ body: string | null }> }>(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages`,
    );
    assert.ok(received.body.messages.some((message) => message.body === 'Guests arrive at 2pm.'));
  });

  it('counts unread messages and clears them on read', async () => {
    const before = await ketut.client.get<{ channels: Array<{ id: string; name: string; unreadCount: number }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    const general = before.body.channels.find((channel) => channel.name === 'general')!;
    assert.ok(general.unreadCount > 0);

    await ketut.client.post(`/villas/${owner.villaId}/messages/channels/${general.id}/read`);

    const after = await ketut.client.get<{ channels: Array<{ name: string; unreadCount: number }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    assert.equal(after.body.channels.find((channel) => channel.name === 'general')!.unreadCount, 0);
  });

  it('does not count your own messages as unread', async () => {
    const channels = await ketut.client.get<{ channels: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    const general = channels.body.channels.find((channel) => channel.name === 'general')!;
    await ketut.client.post(`/villas/${owner.villaId}/messages/channels/${general.id}/messages`, {
      body: 'On my way.',
    });

    const after = await ketut.client.get<{ channels: Array<{ name: string; unreadCount: number }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    assert.equal(after.body.channels.find((channel) => channel.name === 'general')!.unreadCount, 0);
  });

  it('keeps a private channel out of a non-member’s list', async () => {
    const created = await owner.client.post<{ channel: { id: string } }>(
      `/villas/${owner.villaId}/messages/channels`,
      { name: 'owners only', isPrivate: true, memberIds: [] },
    );
    assert.equal(created.status, 201);

    const asKetut = await ketut.client.get<{ channels: Array<{ id: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    assert.ok(!asKetut.body.channels.some((channel) => channel.id === created.body.channel.id));

    const direct = await ketut.client.get(
      `/villas/${owner.villaId}/messages/channels/${created.body.channel.id}/messages`,
    );
    assert.equal(direct.status, 404);
  });
});

describe('direct messages', () => {
  it('reuses the same conversation instead of creating duplicates', async () => {
    const first = await ketut.client.post<{ channel: { id: string }; created: boolean }>(
      `/villas/${owner.villaId}/messages/direct`,
      { membershipIds: [made.membershipId] },
    );
    assert.equal(first.status, 201);
    assert.equal(first.body.created, true);

    // The other participant opening it from their side must land in the same thread.
    const second = await made.client.post<{ channel: { id: string }; created: boolean }>(
      `/villas/${owner.villaId}/messages/direct`,
      { membershipIds: [ketut.membershipId] },
    );
    assert.equal(second.body.created, false);
    assert.equal(second.body.channel.id, first.body.channel.id);
  });

  it('keeps a direct message private, even from a moderator', async () => {
    const conversation = await ketut.client.post<{ channel: { id: string } }>(
      `/villas/${owner.villaId}/messages/direct`,
      { membershipIds: [made.membershipId] },
    );
    await ketut.client.post(`/villas/${owner.villaId}/messages/channels/${conversation.body.channel.id}/messages`, {
      body: 'Between the two of us.',
    });

    // The owner holds every permission, including messages:moderate, and still
    // cannot read a private conversation between two staff members.
    const asOwner = await owner.client.get(
      `/villas/${owner.villaId}/messages/channels/${conversation.body.channel.id}/messages`,
    );
    assert.equal(asOwner.status, 404);
  });

  it('refuses a direct message to someone in another villa', async () => {
    const response = await ketut.client.post(`/villas/${owner.villaId}/messages/direct`, {
      membershipIds: [outsiderVilla.membershipId],
    });
    assert.equal(response.status, 400);
  });

  it('refuses a conversation with only yourself', async () => {
    const response = await ketut.client.post(`/villas/${owner.villaId}/messages/direct`, {
      membershipIds: [ketut.membershipId],
    });
    assert.equal(response.status, 400);
  });
});

describe('message permissions', () => {
  it('lets a read-only member read but not send', async () => {
    await setRolePermissions(owner, 'staff', ['villa:view', 'members:view', 'messages:read']);

    const channels = await made.client.get<{ channels: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    assert.equal(channels.status, 200);
    const general = channels.body.channels.find((channel) => channel.name === 'general')!;

    const response = await made.client.post(`/villas/${owner.villaId}/messages/channels/${general.id}/messages`, {
      body: 'Can I speak?',
    });
    assert.equal(response.status, 403);
  });

  it('hides messaging entirely from someone without messages:read', async () => {
    await setRolePermissions(owner, 'staff', ['villa:view']);
    const response = await made.client.get(`/villas/${owner.villaId}/messages/channels`);
    assert.equal(response.status, 403);
  });

  it('lets a moderator remove a message but keeps the removal visible', async () => {
    await setRolePermissions(owner, 'staff', [
      'villa:view',
      'members:view',
      'messages:read',
      'messages:send',
    ]);
    const channels = await ketut.client.get<{ channels: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    const general = channels.body.channels.find((channel) => channel.name === 'general')!;
    const sent = await ketut.client.post<{ message: { id: string } }>(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages`,
      { body: 'Something to be moderated.' },
    );

    // Another staff member cannot delete it.
    const byPeer = await made.client.delete(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages/${sent.body.message.id}`,
    );
    assert.equal(byPeer.status, 403);

    const byOwner = await owner.client.delete(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages/${sent.body.message.id}`,
    );
    assert.equal(byOwner.status, 204);

    const messages = await ketut.client.get<{ messages: Array<{ id: string; deleted: boolean; body: string | null }> }>(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages`,
    );
    const removed = messages.body.messages.find((message) => message.id === sent.body.message.id)!;
    assert.equal(removed.deleted, true);
    assert.equal(removed.body, null, 'the text of a removed message must not be served');
  });

  it('lets an author edit only their own message', async () => {
    const channels = await ketut.client.get<{ channels: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    const general = channels.body.channels.find((channel) => channel.name === 'general')!;
    const sent = await ketut.client.post<{ message: { id: string } }>(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages`,
      { body: 'Origanal typo' },
    );

    const byOther = await made.client.patch(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages/${sent.body.message.id}`,
      { body: 'Rewritten by someone else' },
    );
    assert.equal(byOther.status, 403);

    const byAuthor = await ketut.client.patch(
      `/villas/${owner.villaId}/messages/channels/${general.id}/messages/${sent.body.message.id}`,
      { body: 'Original typo fixed' },
    );
    assert.equal(byAuthor.status, 200);
  });
});
