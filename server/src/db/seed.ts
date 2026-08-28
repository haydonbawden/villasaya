/**
 * Demo data for a realistic Bali villa: an owner, a manager and four staff,
 * with a published roster, live tasks, leave history and expense claims in
 * every state.
 *
 * Run with `npm run seed`. It refuses to touch a database that already has
 * users, so it can never clobber real data.
 */
import { execute, migrate, nextReference, query, queryOne, transaction } from './index.ts';
import { hashPassword } from '../auth/password.ts';
import { newId } from '../lib/ids.ts';
import { createVillaWorkspace, joinDefaultChannels } from '../services/villas.ts';
import { countLeaveDays } from '../lib/dates.ts';

const PASSWORD = 'villa-demo-2026';

type StaffSpec = {
  email: string;
  fullName: string;
  jobTitle: string;
  roleKey: string;
  payRateMinor: number;
  payPeriod: 'hour' | 'month';
};

const STAFF: StaffSpec[] = [
  { email: 'made@villademo.test', fullName: 'Made Sukra', jobTitle: 'Villa Manager', roleKey: 'manager', payRateMinor: 9_500_000, payPeriod: 'month' },
  { email: 'ketut@villademo.test', fullName: 'Ketut Adi', jobTitle: 'Head Housekeeper', roleKey: 'supervisor', payRateMinor: 5_200_000, payPeriod: 'month' },
  { email: 'nyoman@villademo.test', fullName: 'Nyoman Rai', jobTitle: 'Housekeeper', roleKey: 'staff', payRateMinor: 35_000, payPeriod: 'hour' },
  { email: 'putu@villademo.test', fullName: 'Putu Gede', jobTitle: 'Gardener & Pool', roleKey: 'staff', payRateMinor: 38_000, payPeriod: 'hour' },
];

function day(offset: number): string {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

function at(dayOffset: number, hour: number): string {
  const date = new Date(Date.now() + dayOffset * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function main(): Promise<void> {
  migrate();

  const existing = queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM users');
  if ((existing?.count ?? 0) > 0) {
    console.error('[seed] this database already has users — refusing to overwrite it.');
    console.error('[seed] delete the database file first if you want a fresh demo workspace.');
    process.exitCode = 1;
    return;
  }

  const now = new Date().toISOString();
  const passwordHash = await hashPassword(PASSWORD);

  const ownerId = newId();
  execute(
    `INSERT INTO users (id, email, email_normalised, password_hash, full_name, phone, avatar_colour, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [ownerId, 'wayan@villademo.test', 'wayan@villademo.test', passwordHash, 'Wayan Sari', '+62 812 3456 7890', '#0f766e', now, now],
  );

  const villa = createVillaWorkspace({
    name: 'Villa Melati Seminyak',
    ownerUserId: ownerId,
    address: 'Jl. Kayu Aya No. 12, Seminyak, Badung, Bali',
  });
  const villaId = villa.villaId;

  const roles = new Map(
    query<{ id: string; key: string }>('SELECT id, key FROM roles WHERE villa_id = ?', [villaId]).map((row) => [
      row.key,
      row.id,
    ]),
  );

  const memberships = new Map<string, string>([['wayan', villa.ownerMembershipId]]);

  transaction(() => {
    for (const person of STAFF) {
      const userId = newId();
      execute(
        `INSERT INTO users (id, email, email_normalised, password_hash, full_name, avatar_colour, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, person.email, person.email, passwordHash, person.fullName, pickColour(person.email), now, now],
      );
      const membershipId = newId();
      execute(
        `INSERT INTO memberships (id, villa_id, user_id, role_id, job_title, employment_type, pay_rate_minor, pay_period, started_on, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
        [
          membershipId, villaId, userId, roles.get(person.roleKey)!, person.jobTitle,
          person.payPeriod === 'hour' ? 'part_time' : 'full_time',
          person.payRateMinor, person.payPeriod, day(-400), now, now,
        ],
      );
      joinDefaultChannels(villaId, membershipId);
      memberships.set(person.email.split('@')[0]!, membershipId);
    }
  });

  const made = memberships.get('made')!;
  const ketut = memberships.get('ketut')!;
  const nyoman = memberships.get('nyoman')!;
  const putu = memberships.get('putu')!;

  const taskCategories = new Map(
    query<{ id: string; name: string }>('SELECT id, name FROM task_categories WHERE villa_id = ?', [villaId]).map(
      (row) => [row.name, row.id],
    ),
  );
  const expenseCategories = new Map(
    query<{ id: string; name: string }>('SELECT id, name FROM expense_categories WHERE villa_id = ?', [villaId]).map(
      (row) => [row.name, row.id],
    ),
  );
  const leaveTypes = new Map(
    query<{ id: string; name: string }>('SELECT id, name FROM leave_types WHERE villa_id = ?', [villaId]).map(
      (row) => [row.name, row.id],
    ),
  );

  // --- Tasks -----------------------------------------------------------------
  transaction(() => {
    const tasks: Array<{
      title: string; category: string; priority: string; status: string;
      dueOffset: number; assignees: string[]; checklist?: string[]; description?: string;
    }> = [
      { title: 'Deep clean the guest suite before check-in', category: 'Housekeeping', priority: 'urgent', status: 'in_progress', dueOffset: 0, assignees: [nyoman], checklist: ['Strip and remake the beds', 'Restock the minibar', 'Fresh frangipani in the bathroom'], description: 'Guests arrive at 2pm. The suite must be finished by 1pm at the latest.' },
      { title: 'Balance the pool chemicals', category: 'Pool & Garden', priority: 'high', status: 'todo', dueOffset: 0, assignees: [putu], checklist: ['Test chlorine and pH', 'Backwash the filter'] },
      { title: 'Fix the dripping tap in Bedroom 2', category: 'Maintenance', priority: 'normal', status: 'blocked', dueOffset: 2, assignees: [putu], description: 'Waiting on a replacement washer from the hardware shop in Kerobokan.' },
      { title: 'Restock welcome drinks and snacks', category: 'Guest Services', priority: 'normal', status: 'todo', dueOffset: 1, assignees: [ketut] },
      { title: 'Trim the frangipani along the driveway', category: 'Pool & Garden', priority: 'low', status: 'todo', dueOffset: 5, assignees: [putu] },
      { title: 'Monthly linen inventory', category: 'Housekeeping', priority: 'normal', status: 'done', dueOffset: -3, assignees: [ketut, nyoman] },
    ];

    for (const spec of tasks) {
      const taskId = newId();
      const reference = nextReference('tasks', villaId);
      execute(
        `INSERT INTO tasks (id, villa_id, reference, title, description, category_id, priority, status, due_at, created_by, completed_at, completed_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          taskId, villaId, reference, spec.title, spec.description ?? null,
          taskCategories.get(spec.category) ?? null, spec.priority, spec.status,
          at(spec.dueOffset, 6), ownerId,
          spec.status === 'done' ? at(spec.dueOffset, 9) : null,
          spec.status === 'done' ? ownerId : null,
          now, now,
        ],
      );
      for (const membershipId of spec.assignees) {
        execute(
          'INSERT INTO task_assignees (task_id, membership_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?)',
          [taskId, membershipId, now, ownerId],
        );
      }
      (spec.checklist ?? []).forEach((label, index) => {
        execute(
          'INSERT INTO task_checklist_items (id, task_id, label, is_done, position, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [newId(), taskId, label, index === 0 && spec.status === 'in_progress' ? 1 : 0, index, now],
        );
      });
    }
  });

  // --- Roster: last week published, next week half drafted --------------------
  transaction(() => {
    const pattern: Array<{ membershipId: string; startHour: number; endHour: number; title: string }> = [
      { membershipId: nyoman, startHour: 1, endHour: 9, title: 'Housekeeping — morning' },
      { membershipId: putu, startHour: 0, endHour: 6, title: 'Pool & garden' },
      { membershipId: ketut, startHour: 2, endHour: 10, title: 'Supervision' },
    ];
    for (let offset = -7; offset <= 10; offset += 1) {
      // Sunday is the villa's quiet day.
      if (new Date(Date.now() + offset * 86_400_000).getUTCDay() === 0) continue;
      for (const entry of pattern) {
        const published = offset <= 3;
        execute(
          `INSERT INTO shifts (id, villa_id, membership_id, title, starts_at, ends_at, break_minutes, location, status, published_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 30, ?, ?, ?, ?, ?, ?)`,
          [
            newId(), villaId, entry.membershipId, entry.title,
            at(offset, entry.startHour), at(offset, entry.endHour),
            'Main villa', published ? 'published' : 'draft', published ? now : null,
            ownerId, now, now,
          ],
        );
      }
    }
    // One unfilled shift so the dashboard has something to flag.
    execute(
      `INSERT INTO shifts (id, villa_id, membership_id, title, starts_at, ends_at, break_minutes, location, status, published_at, created_by, created_at, updated_at)
       VALUES (?, ?, NULL, 'Evening turndown', ?, ?, 0, 'Main villa', 'published', ?, ?, ?, ?)`,
      [newId(), villaId, at(2, 11), at(2, 14), now, ownerId, now, now],
    );
  });

  // --- Leave -----------------------------------------------------------------
  transaction(() => {
    const requests: Array<{ membershipId: string; type: string; from: number; to: number; status: string; reason: string }> = [
      { membershipId: nyoman, type: 'Religious Holiday', from: 14, to: 15, status: 'pending', reason: 'Galungan ceremony at the family temple' },
      { membershipId: putu, type: 'Annual Leave', from: 21, to: 25, status: 'pending', reason: 'Family trip to Lombok' },
      { membershipId: ketut, type: 'Sick Leave', from: -10, to: -9, status: 'approved', reason: 'Fever' },
      { membershipId: nyoman, type: 'Annual Leave', from: -40, to: -36, status: 'approved', reason: 'Village ceremony' },
    ];
    for (const request of requests) {
      const totalDays = countLeaveDays(day(request.from), day(request.to), false, false);
      execute(
        `INSERT INTO leave_requests (id, villa_id, membership_id, leave_type_id, start_date, end_date, total_days, reason, status, decided_by, decided_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(), villaId, request.membershipId, leaveTypes.get(request.type)!,
          day(request.from), day(request.to), totalDays, request.reason, request.status,
          request.status === 'approved' ? ownerId : null,
          request.status === 'approved' ? now : null,
          now, now,
        ],
      );
    }
  });

  // --- Expense claims in every state -----------------------------------------
  transaction(() => {
    const claims: Array<{
      membershipId: string; title: string; category: string; amount: number;
      spentOffset: number; status: string; merchant: string; note?: string;
    }> = [
      { membershipId: putu, title: 'Replacement pool pump seal', category: 'Maintenance & Repairs', amount: 850_000, spentOffset: -2, status: 'submitted', merchant: 'Toko Bali Jaya' },
      { membershipId: nyoman, title: 'Guest welcome fruit basket', category: 'Guest Supplies', amount: 320_000, spentOffset: -1, status: 'submitted', merchant: 'Pasar Seminyak' },
      { membershipId: ketut, title: 'Weekly market shop', category: 'Groceries', amount: 415_000, spentOffset: -3, status: 'approved', merchant: 'Pasar Kerobokan', note: 'Automatically approved: within the category limit' },
      { membershipId: putu, title: 'Chlorine and pH minus', category: 'Pool Chemicals', amount: 680_000, spentOffset: -8, status: 'reimbursed', merchant: 'Bali Pool Supplies' },
      { membershipId: nyoman, title: 'Taxi to collect linen', category: 'Transport', amount: 150_000, spentOffset: -6, status: 'reimbursed', merchant: 'Bluebird' },
      { membershipId: ketut, title: 'Unlabelled hardware purchase', category: 'Maintenance & Repairs', amount: 1_250_000, spentOffset: -12, status: 'rejected', merchant: 'Unknown', note: 'No receipt attached — please resubmit with the receipt photo.' },
    ];

    for (const claim of claims) {
      const decided = ['approved', 'rejected', 'reimbursed'].includes(claim.status);
      execute(
        `INSERT INTO expense_claims (id, villa_id, reference, membership_id, category_id, title, amount_minor, currency, spent_on, merchant, payment_method, status, submitted_at, decided_by, decided_at, decision_note, reimbursed_at, reimbursed_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'IDR', ?, ?, 'own_funds', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(), villaId, nextReference('expense_claims', villaId), claim.membershipId,
          expenseCategories.get(claim.category) ?? null, claim.title, claim.amount,
          day(claim.spentOffset), claim.merchant, claim.status, now,
          decided ? ownerId : null, decided ? now : null, claim.note ?? null,
          claim.status === 'reimbursed' ? now : null,
          claim.status === 'reimbursed' ? ownerId : null,
          now, now,
        ],
      );
    }
  });

  // --- Conversation ----------------------------------------------------------
  transaction(() => {
    const general = queryOne<{ id: string }>(
      "SELECT id FROM channels WHERE villa_id = ? AND name = 'general'",
      [villaId],
    )!;
    const maintenanceId = newId();
    execute(
      `INSERT INTO channels (id, villa_id, kind, name, topic, is_private, is_default, created_by, created_at, updated_at)
       VALUES (?, ?, 'channel', 'maintenance', 'Repairs, suppliers and anything broken', 0, 0, ?, ?, ?)`,
      [maintenanceId, villaId, ownerId, now, now],
    );
    for (const membershipId of [villa.ownerMembershipId, made, putu]) {
      execute('INSERT INTO channel_members (channel_id, membership_id, role, joined_at) VALUES (?, ?, ?, ?)', [
        maintenanceId, membershipId, membershipId === villa.ownerMembershipId ? 'moderator' : 'member', now,
      ]);
    }

    const conversation: Array<[string, string, string]> = [
      [general.id, villa.ownerMembershipId, 'Guests check in at 2pm today — the suite needs to be ready by 1.'],
      [general.id, ketut, 'Understood. Nyoman is on the suite now, I will check it at 12:30.'],
      [general.id, nyoman, 'Beds are done, working on the bathroom.'],
      [maintenanceId, putu, 'Pool pump seal replaced. Receipt uploaded to a claim.'],
      [maintenanceId, made, 'Thanks Putu. I will approve it this afternoon.'],
    ];
    conversation.forEach(([channelId, authorId, body], index) => {
      execute(
        `INSERT INTO messages (id, villa_id, channel_id, author_id, body, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [newId(), villaId, channelId, authorId, body, new Date(Date.now() - (10 - index) * 600_000).toISOString()],
      );
    });
  });

  console.log('\n  Demo workspace ready: Villa Melati Seminyak\n');
  console.log('  Sign in with any of these — the password is the same for all:\n');
  console.log(`    Owner       wayan@villademo.test     ${PASSWORD}`);
  for (const person of STAFF) {
    console.log(`    ${person.roleKey.padEnd(11)} ${person.email.padEnd(24)} ${PASSWORD}`);
  }
  console.log('\n  Sign in as the owner to see approvals and reports, or as Nyoman to');
  console.log('  see how much smaller the app is for a staff member.\n');
}

function pickColour(seed: string): string {
  const palette = ['#1d4ed8', '#7c3aed', '#b91c1c', '#c2410c', '#0369a1', '#15803d'];
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length]!;
}

await main();
