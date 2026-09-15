/**
 * Modules a villa can switch off.
 *
 * The contract worth holding the app to is the second half of "hides, never
 * deletes": anyone can make a menu item disappear, but a villa manager will
 * only ever use the switch if turning it back on gives them their records
 * back, unchanged.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, dateDaysFromNow, startTestServer, type Actor } from './helpers.ts';

const { url, close } = await startTestServer();
after(close);

type VillaBody = { features: string[]; me: { permissions: string[] } };

let owner: Actor & { villaId: string };
let staff: Actor & { membershipId: string };

const villa = () => owner.client.get<VillaBody>(`/villas/${owner.villaId}`);
const setModules = (features: Record<string, boolean>) =>
  owner.client.put<{ features: string[] }>(`/villas/${owner.villaId}/features`, { features });

before(async () => {
  owner = await createOwner(url, { email: 'owner@modules.test', villaName: 'Villa Modules' });
  staff = await addStaff(url, owner, { email: 'staff@modules.test', fullName: 'Komang' });
});

describe('the module catalogue', () => {
  it('describes every module and what a new villa starts with', async () => {
    const response = await owner.client.get<{
      features: Array<{ key: string; label: string; description: string; defaultEnabled: boolean }>;
    }>('/villas/features');
    assert.equal(response.status, 200);
    const keys = response.body.features.map((feature) => feature.key).sort();
    assert.deepEqual(keys, ['expenses', 'leave', 'messages', 'roster', 'tasks']);
    for (const feature of response.body.features) {
      assert.ok(feature.label.length > 0 && feature.description.length > 0, `${feature.key} is described`);
    }
  });
});

describe('a brand new villa', () => {
  it('runs tasks, roster and messages, and leaves leave and expenses off', async () => {
    const fresh = await createOwner(url, {
      email: 'fresh@modules.test',
      villaName: 'Villa Fresh',
      keepDefaultModules: true,
    });
    const body = (await fresh.client.get<VillaBody>(`/villas/${fresh.villaId}`)).body;
    assert.deepEqual([...body.features].sort(), ['messages', 'roster', 'tasks']);

    // Off is off for the API too, not only for the navigation.
    assert.equal((await fresh.client.get(`/villas/${fresh.villaId}/leave`)).status, 404);
    assert.equal((await fresh.client.get(`/villas/${fresh.villaId}/expenses`)).status, 404);
    assert.equal((await fresh.client.get(`/villas/${fresh.villaId}/tasks`)).status, 200);
  });
});

describe('switching a module off', () => {
  it('gives back the modules that remain', async () => {
    const response = await setModules({ expenses: false });
    assert.equal(response.status, 200);
    assert.deepEqual([...response.body.features].sort(), ['leave', 'messages', 'roster', 'tasks']);
  });

  it('closes every route under it, for staff as well as the owner', async () => {
    assert.equal((await owner.client.get(`/villas/${owner.villaId}/expenses`)).status, 404);
    assert.equal((await owner.client.get(`/villas/${owner.villaId}/expenses/categories`)).status, 404);
    assert.equal((await staff.client.get(`/villas/${owner.villaId}/expenses`)).status, 404);
    assert.equal(
      (await staff.client.post(`/villas/${owner.villaId}/expenses`, {
        title: 'Pool salt',
        amountMinor: 120_000,
        spentOn: dateDaysFromNow(-1),
      })).status,
      404,
    );
  });

  it('leaves the modules it was not asked about alone', async () => {
    const body = (await villa()).body;
    assert.ok(body.features.includes('tasks'));
    assert.ok(body.features.includes('leave'));
  });

  it('takes its tiles off the dashboard without touching the rest', async () => {
    const dashboard = await owner.client.get<{
      me: { pendingClaims: number | null; openTasks: number | null };
      approvals: { expenseClaims: number | null; leaveRequests: number | null };
    }>(`/villas/${owner.villaId}/reports/dashboard`);
    assert.equal(dashboard.body.me.pendingClaims, null, 'no claims tile');
    assert.equal(dashboard.body.approvals.expenseClaims, null, 'no claims to approve');
    assert.notEqual(dashboard.body.me.openTasks, null, 'tasks are still on');
  });

  it('is recorded in the audit log', async () => {
    const audit = await owner.client.get<{ entries: Array<{ action: string }> }>(
      `/villas/${owner.villaId}/audit`,
    );
    assert.ok(audit.body.entries.some((entry) => entry.action === 'villa.features_updated'));
  });
});

describe('switching a module back on', () => {
  it('returns the villa to exactly where it left it', async () => {
    // Money in, module off, module on: the claim has to still be there, with
    // the same reference and the same amount. This is the whole promise.
    await setModules({ expenses: true });
    const claim = await staff.client.post<{ claim: { id: string; reference: string } }>(
      `/villas/${owner.villaId}/expenses`,
      { title: 'Pool salt', amountMinor: 120_000, spentOn: dateDaysFromNow(-1) },
    );
    assert.equal(claim.status, 201);
    const reference = claim.body.claim.reference;

    await setModules({ expenses: false });
    assert.equal((await staff.client.get(`/villas/${owner.villaId}/expenses`)).status, 404);

    await setModules({ expenses: true });
    const back = await staff.client.get<{ claims: Array<{ id: string; reference: string; amountMinor: number }> }>(
      `/villas/${owner.villaId}/expenses`,
    );
    assert.equal(back.status, 200);
    const restored = back.body.claims.find((entry) => entry.id === claim.body.claim.id);
    assert.ok(restored, 'the claim survived the round trip');
    assert.equal(restored.reference, reference, 'and kept its reference');
    assert.equal(restored.amountMinor, 120_000, 'and its amount');
  });
});

describe('the switches themselves', () => {
  it('are refused to staff', async () => {
    const response = await staff.client.put(`/villas/${owner.villaId}/features`, {
      features: { expenses: false },
    });
    assert.equal(response.status, 403);
    assert.ok((await villa()).body.features.includes('expenses'), 'and nothing changed');
  });

  it('reject a module that does not exist', async () => {
    const response = await owner.client.put(`/villas/${owner.villaId}/features`, {
      features: { payroll: true },
    });
    assert.equal(response.status, 400);
  });
});

describe('upgrading a villa that predates modules', () => {
  it('leaves every module switched on', () => {
    // The defaults are for villas created from here on. A villa that has been
    // running on leave and expenses for a year must not lose them to a
    // migration, so 006 backfills explicit rows — and this is the only place
    // that path is exercised, because a test database is always brand new.
    const directory = path.join(import.meta.dirname, '..', 'src', 'db', 'migrations');
    const files = fs.readdirSync(directory).filter((file) => file.endsWith('.sql')).sort();
    const beforeModules = files.filter((file) => file < '006');
    assert.ok(beforeModules.length > 0 && beforeModules.length < files.length, 'there is a before and an after');

    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const file of beforeModules) db.exec(fs.readFileSync(path.join(directory, file), 'utf8'));

    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, email_normalised, password_hash, full_name, created_at, updated_at)
       VALUES ('old-owner', 'lama@villa.test', 'lama@villa.test', 'x', 'Wayan Lama', ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO villas (id, name, slug, timezone, currency, created_by, created_at, updated_at)
       VALUES ('old-villa', 'Villa Lama', 'villa-lama', 'Asia/Makassar', 'IDR', 'old-owner', ?, ?)`,
    ).run(now, now);

    for (const file of files.filter((entry) => entry >= '006')) {
      db.exec(fs.readFileSync(path.join(directory, file), 'utf8'));
    }

    const rows = db
      .prepare('SELECT feature, enabled FROM villa_features WHERE villa_id = ? ORDER BY feature')
      .all('old-villa') as Array<{ feature: string; enabled: number }>;
    db.close();

    assert.deepEqual(
      rows.map((row) => row.feature),
      ['expenses', 'leave', 'messages', 'roster', 'tasks'],
    );
    assert.ok(rows.every((row) => row.enabled === 1), 'nothing was taken away');
  });
});
