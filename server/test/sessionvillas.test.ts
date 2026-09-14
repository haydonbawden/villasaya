/**
 * The villa list in a session response must carry the same fields as
 * GET /villas. The picker renders straight from the session, so a field
 * missing here is a wrong number on screen, not a missing one — memberCount
 * fell back to 0 and every villa claimed "0 people".
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { addStaff, createOwner, startTestServer, type Actor } from './helpers.ts';

const { url, close } = await startTestServer();
after(close);

type VillaSummary = { id: string; memberCount?: number };

let owner: Actor & { villaId: string };

before(async () => {
  owner = await createOwner(url, { email: 'owner@session.test', villaName: 'Villa Session', fullName: 'Wayan' });
  await addStaff(url, owner, { email: 'staff1@session.test', fullName: 'Ketut' });
  await addStaff(url, owner, { email: 'staff2@session.test', fullName: 'Putu' });
});

describe('session villa summaries', () => {
  it('reports the member count on sign-in, not zero', async () => {
    const login = await owner.client.post<{ villas: VillaSummary[] }>('/auth/login', {
      email: 'owner@session.test',
      password: 'test-passphrase-2026',
    });
    assert.equal(login.status, 200);
    const villa = login.body.villas.find((v) => v.id === owner.villaId);
    assert.ok(villa, 'the owner should see their villa in the session');
    assert.equal(villa.memberCount, 3, 'owner plus two staff');
  });

  it('agrees with GET /villas', async () => {
    const login = await owner.client.post<{ villas: VillaSummary[] }>('/auth/login', {
      email: 'owner@session.test',
      password: 'test-passphrase-2026',
    });
    const listed = await owner.client.get<{ villas: VillaSummary[] }>('/villas');
    const fromSession = login.body.villas.find((v) => v.id === owner.villaId);
    const fromList = listed.body.villas.find((v) => v.id === owner.villaId);
    assert.equal(fromSession?.memberCount, fromList?.memberCount);
  });
});
