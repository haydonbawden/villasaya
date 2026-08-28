/**
 * Regression tests for the four issues raised in review on PR #1.
 * Each one failed before its fix.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, setRolePermissions, startTestServer, type Actor } from './helpers.ts';
import { zonedDayRange, zonedRangeBounds } from '../src/lib/dates.ts';

const { url, close } = await startTestServer();
after(close);

let owner: Actor & { villaId: string; membershipId: string };
let ketut: Actor & { membershipId: string };
let putu: Actor & { membershipId: string };

before(async () => {
  owner = await createOwner(url, { email: 'owner@review.test', villaName: 'Villa Review', fullName: 'Wayan' });
  ketut = await addStaff(url, owner, { email: 'ketut@review.test', fullName: 'Ketut' });
  putu = await addStaff(url, owner, { email: 'putu@review.test', fullName: 'Putu' });
});

describe('mentions cannot reach outside a conversation', () => {
  it('drops a mention for someone who is not in the direct message', async () => {
    const dm = await ketut.client.post<{ channel: { id: string } }>(`/villas/${owner.villaId}/messages/direct`, {
      membershipIds: [putu.membershipId],
    });
    const channelId = dm.body.channel.id;

    // The owner is not a participant, but their membership id is public via
    // the members API, so a sender can name it.
    const sent = await ketut.client.post(`/villas/${owner.villaId}/messages/channels/${channelId}/messages`, {
      body: 'SECRET: a private note the owner must not see.',
      mentions: [owner.membershipId],
    });
    assert.equal(sent.status, 201);

    // The conversation itself is already closed to them.
    const read = await owner.client.get(`/villas/${owner.villaId}/messages/channels/${channelId}/messages`);
    assert.equal(read.status, 404);

    // The notification must not quote it either.
    const notifications = await owner.client.get<{ notifications: Array<{ kind: string; body: string | null }> }>(
      `/villas/${owner.villaId}/notifications`,
    );
    const leaked = notifications.body.notifications.filter(
      (entry) => entry.kind === 'message.mention' || (entry.body ?? '').includes('SECRET'),
    );
    assert.deepEqual(leaked, [], 'a non-participant must receive nothing about a private message');
  });

  it('still delivers a mention to someone who is in the channel', async () => {
    const channels = await ketut.client.get<{ channels: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/messages/channels`,
    );
    const general = channels.body.channels.find((channel) => channel.name === 'general')!;

    await ketut.client.post(`/villas/${owner.villaId}/messages/channels/${general.id}/messages`, {
      body: 'Putu, the pool needs a look.',
      mentions: [putu.membershipId],
    });

    const notifications = await putu.client.get<{ notifications: Array<{ kind: string }> }>(
      `/villas/${owner.villaId}/notifications`,
    );
    assert.ok(notifications.body.notifications.some((entry) => entry.kind === 'message.mention'));
  });
});

describe('the dashboard respects the permission model', () => {
  it('omits a resource the caller cannot view, rather than answering anyway', async () => {
    const full = await ketut.client.get<{ me: Record<string, unknown> }>(
      `/villas/${owner.villaId}/reports/dashboard`,
    );
    assert.equal(typeof full.body.me.openTasks, 'number');
    assert.ok(Array.isArray(full.body.me.upcomingShifts));
    assert.equal(typeof full.body.me.pendingClaims, 'number');

    // Narrow the role to nothing but workspace access.
    await setRolePermissions(owner, 'staff', ['villa:view', 'members:view']);

    const narrowed = await ketut.client.get<{ me: Record<string, unknown> }>(
      `/villas/${owner.villaId}/reports/dashboard`,
    );
    assert.equal(narrowed.status, 200);
    assert.equal(narrowed.body.me.openTasks, null);
    assert.equal(narrowed.body.me.overdueTasks, null);
    assert.equal(narrowed.body.me.upcomingShifts, null);
    assert.equal(narrowed.body.me.pendingClaims, null);
    assert.equal(narrowed.body.me.pendingClaimAmountMinor, null);
  });

  it('restores the fields when the permissions come back', async () => {
    await setRolePermissions(owner, 'staff', [
      'villa:view', 'members:view', 'tasks:view.own', 'roster:view.own',
      'expenses:view.own', 'expenses:submit', 'messages:read', 'messages:send',
    ]);
    const response = await ketut.client.get<{ me: Record<string, unknown> }>(
      `/villas/${owner.villaId}/reports/dashboard`,
    );
    assert.equal(response.body.me.openTasks, 0);
    assert.ok(Array.isArray(response.body.me.upcomingShifts));
  });
});

describe('villa-local calendar days', () => {
  it('bounds a local day correctly across offsets and daylight saving', () => {
    const bali = zonedDayRange('2026-08-28', 'Asia/Makassar');
    assert.equal(bali.startUtc, '2026-08-27T16:00:00.000Z');
    assert.equal(bali.endUtc, '2026-08-28T16:00:00.000Z');

    // Sydney is UTC+11 in January and UTC+10 in July.
    assert.equal(zonedDayRange('2026-01-15', 'Australia/Sydney').startUtc, '2026-01-14T13:00:00.000Z');
    assert.equal(zonedDayRange('2026-07-15', 'Australia/Sydney').startUtc, '2026-07-14T14:00:00.000Z');

    const utc = zonedDayRange('2026-08-28', 'UTC');
    assert.equal(utc.startUtc, '2026-08-28T00:00:00.000Z');

    const span = zonedRangeBounds('2026-08-01', '2026-08-31', 'Asia/Makassar');
    assert.equal(span.startUtc, '2026-07-31T16:00:00.000Z');
    assert.equal(span.endUtc, '2026-08-31T16:00:00.000Z');
  });

  it('counts an early-morning shift on the villa day it actually falls on', async () => {
    // 06:00 in Bali is 22:00 the previous day in UTC, which SQLite's date()
    // would file under yesterday.
    const local = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const bounds = zonedDayRange(local, 'Asia/Makassar');
    const sixAmLocal = new Date(Date.parse(bounds.startUtc) + 6 * 3_600_000).toISOString();
    const tenAmLocal = new Date(Date.parse(bounds.startUtc) + 10 * 3_600_000).toISOString();

    const created = await owner.client.post(`/villas/${owner.villaId}/roster`, {
      membershipId: putu.membershipId,
      title: 'Early pool clean',
      startsAt: sixAmLocal,
      endsAt: tenAmLocal,
      publish: true,
    });
    assert.equal(created.status, 201);

    const dashboard = await owner.client.get<{ team: { onShiftToday: Array<{ fullName: string }> } }>(
      `/villas/${owner.villaId}/reports/dashboard`,
    );
    assert.ok(
      dashboard.body.team.onShiftToday.some((entry) => entry.fullName === 'Putu'),
      'a 06:00 local shift must count as on shift today',
    );

    // And the payroll report must find it on the same local day.
    const hours = await owner.client.get<{ rows: Array<{ staffName: string; hours: number }> }>(
      `/villas/${owner.villaId}/reports/hours?from=${local}&to=${local}`,
    );
    const row = hours.body.rows.find((entry) => entry.staffName === 'Putu');
    assert.ok(row, 'the shift must appear in the hours report for that day');
    assert.equal(row?.hours, 4); // 06:00–10:00 local, with no break set.
  });
});
