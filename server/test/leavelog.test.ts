/**
 * Leave is a record, not an entitlement. Quotas, balances and the over-quota
 * rejection are gone; what remains is a log you can narrow, with a total for
 * whatever the filter is showing.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, dateDaysFromNow, startTestServer, type Actor } from './helpers.ts';

const { url, close } = await startTestServer();
after(close);

type Totals = {
  days: number;
  requests: number;
  pendingDays: number;
  byType: Array<{ leaveTypeName: string; days: number; requests: number }>;
};
type LogResponse = { requests: Array<{ id: string; status: string; totalDays: number }>; totals: Totals };

let owner: Actor & { villaId: string };
let ketut: Actor & { membershipId: string };
let putu: Actor & { membershipId: string };
let annualId = '';
let sickId = '';

const log = (qs = '') => owner.client.get<LogResponse>(`/villas/${owner.villaId}/leave${qs}`);

before(async () => {
  owner = await createOwner(url, { email: 'owner@leavelog.test', villaName: 'Villa Log', fullName: 'Wayan' });
  ketut = await addStaff(url, owner, { email: 'ketut@leavelog.test', fullName: 'Ketut' });
  putu = await addStaff(url, owner, { email: 'putu@leavelog.test', fullName: 'Putu' });

  const types = await owner.client.get<{ types: Array<{ id: string; name: string }> }>(
    `/villas/${owner.villaId}/leave/types`);
  annualId = types.body.types.find((t) => t.name === 'Annual Leave')!.id;
  sickId = types.body.types.find((t) => t.name === 'Sick Leave')!.id;

  // Ketut: 3 days annual, approved. Putu: 1 day sick, left pending.
  const a = await ketut.client.post<{ request: { id: string } }>(`/villas/${owner.villaId}/leave`, {
    leaveTypeId: annualId, startDate: dateDaysFromNow(10), endDate: dateDaysFromNow(12),
  });
  await owner.client.post(`/villas/${owner.villaId}/leave/${a.body.request.id}/decision`, { decision: 'approved' });
  await putu.client.post(`/villas/${owner.villaId}/leave`, {
    leaveTypeId: sickId, startDate: dateDaysFromNow(4), endDate: dateDaysFromNow(4),
  });
});

describe('the leave log', () => {
  it('no longer serves balances or accepts allowances', async () => {
    assert.equal((await owner.client.get(`/villas/${owner.villaId}/leave/balances`)).status, 404);
    assert.equal((await owner.client.put(`/villas/${owner.villaId}/leave/allowances`, {})).status, 404);
  });

  it('totals the days it is showing, splitting out what is still pending', async () => {
    const all = await log();
    assert.equal(all.body.totals.days, 4, '3 approved + 1 pending');
    assert.equal(all.body.totals.requests, 2);
    assert.equal(all.body.totals.pendingDays, 1);
  });

  it('breaks the total down by leave type', async () => {
    const byType = (await log()).body.totals.byType;
    assert.equal(byType.find((t) => t.leaveTypeName === 'Annual Leave')?.days, 3);
    assert.equal(byType.find((t) => t.leaveTypeName === 'Sick Leave')?.days, 1);
  });

  it('narrows by leave type, and the total follows the filter', async () => {
    const sick = await log(`?leaveTypeId=${sickId}`);
    assert.equal(sick.body.requests.length, 1);
    assert.equal(sick.body.totals.days, 1);
    assert.equal(sick.body.totals.requests, 1);
  });

  it('narrows by person and by status', async () => {
    const forKetut = await log(`?membershipId=${ketut.membershipId}`);
    assert.equal(forKetut.body.totals.days, 3);

    const pending = await log('?status=pending');
    assert.equal(pending.body.requests.length, 1);
    assert.equal(pending.body.totals.days, 1);
  });

  it('leaves cancelled leave out of the total, because it was never taken', async () => {
    const extra = await ketut.client.post<{ request: { id: string } }>(`/villas/${owner.villaId}/leave`, {
      leaveTypeId: annualId, startDate: dateDaysFromNow(40), endDate: dateDaysFromNow(44),
    });
    const before = (await log()).body.totals.days;
    await ketut.client.post(`/villas/${owner.villaId}/leave/${extra.body.request.id}/cancel`, {});
    const after = (await log()).body.totals.days;
    assert.equal(after, before - 5, 'the cancelled five days come back out of the total');
  });

  it('accepts a request of any length', async () => {
    const long = await ketut.client.post(`/villas/${owner.villaId}/leave`, {
      leaveTypeId: annualId, startDate: dateDaysFromNow(200), endDate: dateDaysFromNow(260),
    });
    assert.equal(long.status, 201, 'no quota left to exceed');
  });
});
