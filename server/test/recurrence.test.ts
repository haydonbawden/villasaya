/**
 * Repeating tasks used to store a rule and do nothing with it: "repeat weekly"
 * happened exactly once. The next instance is now opened when the previous one
 * is completed.
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, startTestServer, type Actor } from './helpers.ts';
import { nextOccurrence } from '../src/lib/dates.ts';

const { url, close } = await startTestServer();
after(close);

type Task = { id: string; title: string; status: string; dueAt: string | null; recurrence: string | null };

let owner: Actor & { villaId: string; membershipId: string };
let staff: Actor & { membershipId: string };

before(async () => {
  owner = await createOwner(url, { email: 'owner@recur.test', villaName: 'Villa Recur', fullName: 'Wayan' });
  staff = await addStaff(url, owner, { email: 'staff@recur.test', fullName: 'Nyoman' });
});

async function createTask(body: Record<string, unknown>) {
  const res = await owner.client.post<{ task: Task }>(`/villas/${owner.villaId}/tasks`, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.task;
}

const complete = (id: string) =>
  owner.client.patch<{ task: Task; nextTask: Task | null }>(
    `/villas/${owner.villaId}/tasks/${id}`, { status: 'done' });

describe('recurrence arithmetic', () => {
  it('advances daily, weekly and monthly in the villa timezone', () => {
    const tz = 'Asia/Makassar';
    assert.equal(nextOccurrence('daily', '2026-09-14T23:00:00Z', tz), '2026-09-15T23:00:00.000Z');
    // 15 Sept is a Tuesday locally; the next Monday is the 21st.
    assert.equal(nextOccurrence('weekly:1', '2026-09-14T23:00:00Z', tz), '2026-09-20T23:00:00.000Z');
    // February is too short for the 31st, so it lands on the last day.
    assert.equal(nextOccurrence('monthly:31', '2026-01-31T01:00:00Z', tz)?.slice(0, 10), '2026-02-28');
  });

  it('returns null for a rule it does not understand', () => {
    assert.equal(nextOccurrence('every-other-tuesday', '2026-09-14T23:00:00Z', 'Asia/Makassar'), null);
  });
});

describe('completing a repeating task', () => {
  it('opens the next one, carrying assignees and a fresh checklist', async () => {
    const task = await createTask({
      title: 'Balance the pool chemicals',
      dueAt: '2026-09-14T23:00:00Z',
      recurrence: 'daily',
      assigneeIds: [staff.membershipId],
      checklist: ['Test pH', 'Add chlorine'],
    });

    const done = await complete(task.id);
    assert.equal(done.status, 200);
    assert.ok(done.body.nextTask, 'completing a repeating task should open the next one');
    assert.equal(done.body.nextTask.title, 'Balance the pool chemicals');
    assert.equal(done.body.nextTask.status, 'todo');
    assert.equal(done.body.nextTask.dueAt, '2026-09-15T23:00:00.000Z');
    assert.equal(done.body.nextTask.recurrence, 'daily');

    const next = await owner.client.get<{
      task: Task & { assignees: Array<{ membershipId: string }> };
      checklist: Array<{ label: string; isDone: boolean }>;
    }>(`/villas/${owner.villaId}/tasks/${done.body.nextTask.id}`);
    assert.deepEqual(next.body.task.assignees.map((a) => a.membershipId), [staff.membershipId]);
    assert.deepEqual(next.body.checklist.map((c) => c.label), ['Test pH', 'Add chlorine']);
    assert.ok(next.body.checklist.every((c) => !c.isDone), 'a repeated checklist comes back unticked');
  });

  it('does not open a second copy when a task is reopened and completed again', async () => {
    const task = await createTask({
      title: 'Change the linens', dueAt: '2026-09-14T23:00:00Z', recurrence: 'weekly:1',
      assigneeIds: [], checklist: [],
    });
    const first = await complete(task.id);
    assert.ok(first.body.nextTask);

    await owner.client.patch(`/villas/${owner.villaId}/tasks/${task.id}`, { status: 'todo' });
    const second = await complete(task.id);
    assert.equal(second.body.nextTask, null, 'the occurrence already exists, so none is created');

    const all = await owner.client.get<{ tasks: Task[] }>(`/villas/${owner.villaId}/tasks?search=linens`);
    const opened = all.body.tasks.filter((t) => t.title === 'Change the linens' && t.status === 'todo');
    assert.equal(opened.length, 1, 'exactly one open instance, not two');
  });

  it('leaves a one-off task alone', async () => {
    const task = await createTask({
      title: 'Fix the gate latch', dueAt: '2026-09-14T23:00:00Z', assigneeIds: [], checklist: [],
    });
    const done = await complete(task.id);
    assert.equal(done.body.nextTask, null);
  });
});
