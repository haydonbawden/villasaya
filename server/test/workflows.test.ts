import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import {
  addStaff,
  createOwner,
  dateDaysFromNow,
  isoDaysFromNow,
  startTestServer,
  type Actor,
} from './helpers.ts';

const { url, close } = await startTestServer();
after(close);

let owner: Actor & { villaId: string; membershipId: string };
let staff: Actor & { membershipId: string };
let manager: Actor & { membershipId: string };

before(async () => {
  owner = await createOwner(url, { email: 'owner@flows.test', villaName: 'Villa Cempaka', fullName: 'Wayan' });
  staff = await addStaff(url, owner, { email: 'staff@flows.test', fullName: 'Ketut', jobTitle: 'Housekeeper' });
  manager = await addStaff(url, owner, { email: 'manager@flows.test', roleKey: 'manager', fullName: 'Made' });
});

describe('expense claims', () => {
  async function categoryId(name: string): Promise<string> {
    const response = await owner.client.get<{ categories: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/expenses/categories`,
    );
    return response.body.categories.find((category) => category.name === name)!.id;
  }

  it('submits a claim for approval', async () => {
    const created = await staff.client.post<{ claim: { id: string; status: string; reference: string } }>(
      `/villas/${owner.villaId}/expenses`,
      {
        title: 'Pool pump seal',
        categoryId: await categoryId('Maintenance & Repairs'),
        amountMinor: 850_000,
        spentOn: dateDaysFromNow(-2),
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.claim.status, 'submitted');
    assert.equal(created.body.claim.reference, 'CLAIM-1');
  });

  it('auto-approves a small claim inside a category limit', async () => {
    const created = await staff.client.post<{ claim: { status: string } }>(`/villas/${owner.villaId}/expenses`, {
      title: 'Market vegetables',
      categoryId: await categoryId('Groceries'),
      amountMinor: 120_000, // Groceries auto-approves up to 500,000.
      spentOn: dateDaysFromNow(-1),
    });
    assert.equal(created.body.claim.status, 'approved');
  });

  it('still requires approval above the category limit', async () => {
    const created = await staff.client.post<{ claim: { status: string } }>(`/villas/${owner.villaId}/expenses`, {
      title: 'Bulk supplies run',
      categoryId: await categoryId('Groceries'),
      amountMinor: 900_000,
      spentOn: dateDaysFromNow(-1),
    });
    assert.equal(created.body.claim.status, 'submitted');
  });

  it('refuses a claim dated in the future', async () => {
    const response = await staff.client.post(`/villas/${owner.villaId}/expenses`, {
      title: 'Time travel',
      amountMinor: 10_000,
      spentOn: dateDaysFromNow(30),
    });
    assert.equal(response.status, 400);
  });

  it('refuses a zero or negative amount', async () => {
    const response = await staff.client.post(`/villas/${owner.villaId}/expenses`, {
      title: 'Nothing',
      amountMinor: 0,
      spentOn: dateDaysFromNow(-1),
    });
    assert.equal(response.status, 400);
  });

  it('shows a claimant only their own claims', async () => {
    await manager.client.post(`/villas/${owner.villaId}/expenses`, {
      title: "Manager's own claim",
      amountMinor: 50_000,
      spentOn: dateDaysFromNow(-1),
    });
    const asStaff = await staff.client.get<{ claims: Array<{ staffName: string }> }>(
      `/villas/${owner.villaId}/expenses`,
    );
    assert.ok(asStaff.body.claims.length > 0);
    assert.ok(asStaff.body.claims.every((claim) => claim.staffName === 'Ketut'));

    const asOwner = await owner.client.get<{ claims: Array<{ staffName: string }> }>(
      `/villas/${owner.villaId}/expenses`,
    );
    assert.ok(new Set(asOwner.body.claims.map((claim) => claim.staffName)).size > 1);
  });

  it('blocks self-approval even for someone who can approve', async () => {
    const own = await manager.client.post<{ claim: { id: string } }>(`/villas/${owner.villaId}/expenses`, {
      title: 'Fuel for the villa car',
      amountMinor: 300_000,
      spentOn: dateDaysFromNow(-1),
    });
    const response = await manager.client.post(
      `/villas/${owner.villaId}/expenses/${own.body.claim.id}/decision`,
      { decision: 'approved' },
    );
    assert.equal(response.status, 403);
  });

  it('requires a reason when a claim is declined', async () => {
    const claim = await staff.client.post<{ claim: { id: string } }>(`/villas/${owner.villaId}/expenses`, {
      title: 'Unexplained purchase',
      amountMinor: 700_000,
      spentOn: dateDaysFromNow(-1),
    });
    const withoutNote = await owner.client.post(
      `/villas/${owner.villaId}/expenses/${claim.body.claim.id}/decision`,
      { decision: 'rejected' },
    );
    assert.equal(withoutNote.status, 400);

    const withNote = await owner.client.post(
      `/villas/${owner.villaId}/expenses/${claim.body.claim.id}/decision`,
      { decision: 'rejected', note: 'No receipt attached' },
    );
    assert.equal(withNote.status, 200);
  });

  it('walks a claim through approval and reimbursement', async () => {
    const claim = await staff.client.post<{ claim: { id: string } }>(`/villas/${owner.villaId}/expenses`, {
      title: 'Garden tools',
      amountMinor: 450_000,
      spentOn: dateDaysFromNow(-3),
    });
    const id = claim.body.claim.id;

    // Reimbursing before approval is out of order and must be refused.
    assert.equal(
      (await owner.client.post(`/villas/${owner.villaId}/expenses/${id}/reimburse`, {})).status,
      409,
    );

    assert.equal(
      (await owner.client.post(`/villas/${owner.villaId}/expenses/${id}/decision`, { decision: 'approved' })).status,
      200,
    );
    assert.equal(
      (await owner.client.post(`/villas/${owner.villaId}/expenses/${id}/reimburse`, { reference: 'BCA-001' })).status,
      200,
    );

    const final = await owner.client.get<{ claim: { status: string; reimbursementReference: string } }>(
      `/villas/${owner.villaId}/expenses/${id}`,
    );
    assert.equal(final.body.claim.status, 'reimbursed');
    assert.equal(final.body.claim.reimbursementReference, 'BCA-001');

    // A decided claim is closed to further decisions.
    assert.equal(
      (await owner.client.post(`/villas/${owner.villaId}/expenses/${id}/decision`, { decision: 'rejected', note: 'x' }))
        .status,
      409,
    );
  });

  it('notifies approvers when a claim is submitted', async () => {
    const response = await owner.client.get<{ notifications: Array<{ kind: string }> }>(
      `/villas/${owner.villaId}/notifications`,
    );
    assert.ok(response.body.notifications.some((entry) => entry.kind === 'expense.submitted'));
  });
});

describe('leave', () => {
  async function leaveTypeId(name: string): Promise<string> {
    const response = await staff.client.get<{ types: Array<{ id: string; name: string }> }>(
      `/villas/${owner.villaId}/leave/types`,
    );
    return response.body.types.find((type) => type.name === name)!.id;
  }

  it('counts whole and half days correctly', async () => {
    const created = await staff.client.post<{ request: { totalDays: number; status: string } }>(
      `/villas/${owner.villaId}/leave`,
      {
        leaveTypeId: await leaveTypeId('Annual Leave'),
        startDate: dateDaysFromNow(10),
        endDate: dateDaysFromNow(12),
        endHalfDay: true,
      },
    );
    assert.equal(created.status, 201);
    // 3 calendar days, with the last one a half day.
    assert.equal(created.body.request.totalDays, 2.5);
    assert.equal(created.body.request.status, 'pending');
  });

  it('refuses leave that overlaps an existing request', async () => {
    const response = await staff.client.post(`/villas/${owner.villaId}/leave`, {
      leaveTypeId: await leaveTypeId('Annual Leave'),
      startDate: dateDaysFromNow(11),
      endDate: dateDaysFromNow(14),
    });
    assert.equal(response.status, 409);
  });

  it('refuses leave beyond the remaining balance', async () => {
    const response = await staff.client.post(`/villas/${owner.villaId}/leave`, {
      leaveTypeId: await leaveTypeId('Annual Leave'),
      startDate: dateDaysFromNow(100),
      endDate: dateDaysFromNow(140),
    });
    assert.equal(response.status, 409);
    assert.match((response.body as { error: { message: string } }).error.message, /remain/);
  });

  it('refuses an end date before the start date', async () => {
    const response = await staff.client.post(`/villas/${owner.villaId}/leave`, {
      leaveTypeId: await leaveTypeId('Annual Leave'),
      startDate: dateDaysFromNow(40),
      endDate: dateDaysFromNow(38),
    });
    assert.equal(response.status, 400);
  });

  it('counts pending leave against the balance', async () => {
    const balances = await staff.client.get<{ balances: Array<{ leaveTypeName: string; pendingDays: number; remainingDays: number }> }>(
      `/villas/${owner.villaId}/leave/balances`,
    );
    const annual = balances.body.balances.find((balance) => balance.leaveTypeName === 'Annual Leave')!;
    assert.equal(annual.pendingDays, 2.5);
    assert.equal(annual.remainingDays, 9.5);
  });

  it('blocks approving your own leave', async () => {
    const own = await manager.client.post<{ request: { id: string } }>(`/villas/${owner.villaId}/leave`, {
      leaveTypeId: await leaveTypeId('Sick Leave'),
      startDate: dateDaysFromNow(3),
      endDate: dateDaysFromNow(3),
    });
    const response = await manager.client.post(
      `/villas/${owner.villaId}/leave/${own.body.request.id}/decision`,
      { decision: 'approved' },
    );
    assert.equal(response.status, 403);
  });

  it('moves approved days from pending to taken', async () => {
    const pending = await owner.client.get<{ requests: Array<{ id: string; staffName: string }> }>(
      `/villas/${owner.villaId}/leave?status=pending`,
    );
    const request = pending.body.requests.find((entry) => entry.staffName === 'Ketut')!;
    assert.equal(
      (await owner.client.post(`/villas/${owner.villaId}/leave/${request.id}/decision`, { decision: 'approved' }))
        .status,
      200,
    );

    const balances = await staff.client.get<{ balances: Array<{ leaveTypeName: string; takenDays: number; pendingDays: number }> }>(
      `/villas/${owner.villaId}/leave/balances`,
    );
    const annual = balances.body.balances.find((balance) => balance.leaveTypeName === 'Annual Leave')!;
    assert.equal(annual.takenDays, 2.5);
    assert.equal(annual.pendingDays, 0);
  });

  it('shows staff only their own leave', async () => {
    const response = await staff.client.get<{ requests: Array<{ staffName: string }> }>(
      `/villas/${owner.villaId}/leave`,
    );
    assert.ok(response.body.requests.every((entry) => entry.staffName === 'Ketut'));
  });
});

describe('roster', () => {
  it('creates a shift as a draft that staff cannot see yet', async () => {
    const created = await owner.client.post<{ shift: { id: string; status: string; paidMinutes: number } }>(
      `/villas/${owner.villaId}/roster`,
      {
        membershipId: staff.membershipId,
        title: 'Morning',
        startsAt: isoDaysFromNow(2),
        endsAt: new Date(Date.now() + 2 * 86_400_000 + 8 * 3_600_000).toISOString(),
        breakMinutes: 30,
      },
    );
    assert.equal(created.status, 201);
    assert.equal(created.body.shift.status, 'draft');
    assert.equal(created.body.shift.paidMinutes, 450); // 8 hours minus a 30-minute break.

    const asStaff = await staff.client.get<{ shifts: unknown[] }>(`/villas/${owner.villaId}/roster`);
    assert.equal(asStaff.body.shifts.length, 0, 'a draft roster must stay invisible to staff');
  });

  it('refuses to double-book the same person', async () => {
    const response = await owner.client.post(`/villas/${owner.villaId}/roster`, {
      membershipId: staff.membershipId,
      title: 'Clashing shift',
      startsAt: new Date(Date.now() + 2 * 86_400_000 + 4 * 3_600_000).toISOString(),
      endsAt: new Date(Date.now() + 2 * 86_400_000 + 12 * 3_600_000).toISOString(),
    });
    assert.equal(response.status, 409);
  });

  it('refuses a shift that ends before it starts', async () => {
    const response = await owner.client.post(`/villas/${owner.villaId}/roster`, {
      membershipId: staff.membershipId,
      startsAt: isoDaysFromNow(5),
      endsAt: isoDaysFromNow(4),
    });
    assert.equal(response.status, 400);
  });

  it('publishes drafts and reveals them to staff', async () => {
    const published = await owner.client.post<{ published: number }>(`/villas/${owner.villaId}/roster/publish`, {
      from: isoDaysFromNow(0),
      to: isoDaysFromNow(30),
    });
    assert.ok(published.body.published >= 1);

    const asStaff = await staff.client.get<{ shifts: Array<{ status: string }> }>(`/villas/${owner.villaId}/roster`);
    assert.ok(asStaff.body.shifts.length >= 1);
    assert.ok(asStaff.body.shifts.every((shift) => shift.status === 'published'));
  });

  it('warns, but does not refuse, when a shift lands on approved leave', async () => {
    const leave = await staff.client.get<{ requests: Array<{ startDate: string; status: string }> }>(
      `/villas/${owner.villaId}/leave?status=approved`,
    );
    const approved = leave.body.requests[0]!;
    const response = await owner.client.post<{ warning: string | null }>(`/villas/${owner.villaId}/roster`, {
      membershipId: staff.membershipId,
      title: 'Shift during leave',
      startsAt: `${approved.startDate}T01:00:00.000Z`,
      endsAt: `${approved.startDate}T09:00:00.000Z`,
    });
    assert.equal(response.status, 201);
    assert.match(response.body.warning ?? '', /approved/);
  });

  it('lets staff request a swap only for their own shift', async () => {
    const shifts = await staff.client.get<{ shifts: Array<{ id: string; membershipId: string }> }>(
      `/villas/${owner.villaId}/roster`,
    );
    const own = shifts.body.shifts.find((shift) => shift.membershipId === staff.membershipId)!;
    const requested = await staff.client.post(`/villas/${owner.villaId}/roster/${own.id}/swap`, {
      reason: 'Family ceremony',
    });
    assert.equal(requested.status, 201);

    const duplicate = await staff.client.post(`/villas/${owner.villaId}/roster/${own.id}/swap`, {});
    assert.equal(duplicate.status, 409, 'one open swap request per shift');
  });
});

describe('task allocation', () => {
  it('assigns work and scopes what each person sees', async () => {
    const created = await owner.client.post<{ task: { id: string; reference: string } }>(
      `/villas/${owner.villaId}/tasks`,
      { title: 'Deep clean the guest suite', priority: 'high', assigneeIds: [staff.membershipId] },
    );
    assert.equal(created.status, 201);

    await owner.client.post(`/villas/${owner.villaId}/tasks`, { title: 'Unrelated owner task' });

    const asStaff = await staff.client.get<{ tasks: Array<{ title: string }> }>(`/villas/${owner.villaId}/tasks`);
    assert.equal(asStaff.body.tasks.length, 1);
    assert.equal(asStaff.body.tasks[0]?.title, 'Deep clean the guest suite');
  });

  it('lets an assignee change status but not the task itself', async () => {
    const tasks = await staff.client.get<{ tasks: Array<{ id: string }> }>(`/villas/${owner.villaId}/tasks`);
    const taskId = tasks.body.tasks[0]!.id;

    const status = await staff.client.patch(`/villas/${owner.villaId}/tasks/${taskId}`, { status: 'in_progress' });
    assert.equal(status.status, 200);

    const retitle = await staff.client.patch(`/villas/${owner.villaId}/tasks/${taskId}`, { title: 'Renamed' });
    assert.equal(retitle.status, 403);

    const reassign = await staff.client.patch(`/villas/${owner.villaId}/tasks/${taskId}`, { assigneeIds: [] });
    assert.equal(reassign.status, 403);
  });

  it('clears the completion stamp when a task is reopened', async () => {
    const tasks = await staff.client.get<{ tasks: Array<{ id: string }> }>(`/villas/${owner.villaId}/tasks`);
    const taskId = tasks.body.tasks[0]!.id;

    await staff.client.patch(`/villas/${owner.villaId}/tasks/${taskId}`, { status: 'done' });
    const done = await owner.client.get<{ task: { completedAt: string | null } }>(
      `/villas/${owner.villaId}/tasks/${taskId}`,
    );
    assert.ok(done.body.task.completedAt);

    await owner.client.patch(`/villas/${owner.villaId}/tasks/${taskId}`, { status: 'todo' });
    const reopened = await owner.client.get<{ task: { completedAt: string | null } }>(
      `/villas/${owner.villaId}/tasks/${taskId}`,
    );
    assert.equal(reopened.body.task.completedAt, null);
  });
});
