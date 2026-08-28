# Villa Saya

*Villa Saya* — "my villa" in Indonesian.

A multi-tenant web app for villa owners in Bali to run their staff: expense
claims, rosters, leave, task allocation and team messaging — one workspace per
villa, with permissions the owner controls down to the individual capability.

Built to replace the group chat and the notebook.

---

## What it does

**Workspaces.** An owner signs up and creates a villa. Each villa is a separate
tenant: its own staff, roles, roster, claims and conversations. One person can
own several villas, and one staff member can work across villas — memberships,
not accounts, are what tie a person to a property.

**Invitations.** The owner invites staff by email. The invitee gets a link,
creates their account, and lands directly in the villa with the role they were
invited as. If email delivery isn't configured, the link is returned in the UI
so it can be sent over WhatsApp — which is how most villa staff actually get
reached.

**Granular permissions.** Every villa is seeded with four editable roles (Owner,
Villa Manager, Supervisor, Staff). The owner can rewrite what any role may do
from a permission matrix of 40 capabilities, create new roles, and layer
per-person exceptions on top — "Ketut is Staff, but he can also approve claims"
— without inventing a role for one person.

**The work.**

| Area | What staff get | What managers and owners get |
| --- | --- | --- |
| **Tasks** | Their own board, status changes, checklists, comments | Every task, assignment, categories, priorities, deletion |
| **Roster** | Their published shifts, swap requests | Week planner, drafts, bulk publish, clash detection, swap approval |
| **Leave** | Balance, requests, half days | All requests, approvals, leave types, per-person allowances |
| **Expenses** | Submit claims with receipt photos, track status | Approve, decline with a reason, mark reimbursed, spend reports |
| **Messages** | Channels and direct messages, live | Private channels, moderation |

**Live updates.** Messages and notifications arrive over a WebSocket. The socket
carries invalidation signals rather than data, so what appears on screen has
still been through the same permission-checked endpoints as a normal request.

---

## Quick start

Requires **Node 22.5 or newer** (the server uses the built-in `node:sqlite`, so
there is nothing to compile).

```bash
cd apps/villa-saya
npm install
cp .env.example server/.env      # optional; sensible defaults work as-is

npm run seed                     # demo villa with staff, roster, claims and leave
npm run dev                      # API on :4000, web client on :5173
```

Open <http://localhost:5173> and sign in with a seeded account — the password
for all of them is `villa-demo-2026`:

| Account | Role | Worth seeing |
| --- | --- | --- |
| `wayan@villademo.test` | Owner | Approvals queue, reports, the permission matrix |
| `made@villademo.test` | Villa Manager | Roster planning and approvals, no villa deletion |
| `ketut@villademo.test` | Supervisor | Assigns work, but cannot approve money |
| `nyoman@villademo.test` | Staff | How much smaller the app is without elevated permissions |

Signing in as the owner and then as Nyoman is the fastest way to see the
permission model at work: the navigation, the dashboard and every list change.

### Starting empty instead

Skip `npm run seed` and register at `/register`. Creating an account with a
villa name makes you its owner.

---

## Commands

```bash
npm run dev          # API and web client together
npm run dev:server   # API only, with watch
npm run dev:web      # web client only
npm run build        # typecheck the server, build the client to web/dist
npm test             # 90 server tests
npm run typecheck    # server + tests + client
npm run seed         # demo data (refuses to run against a non-empty database)
```

---

## How it is built

```
apps/villa-saya/
├── server/                     Node + TypeScript, Express, node:sqlite
│   ├── src/
│   │   ├── permissions.ts      the permission catalogue and resolver
│   │   ├── config.ts           environment, with production safety checks
│   │   ├── auth/               scrypt hashing, JWT + rotating refresh tokens,
│   │   │                       villa context and permission middleware
│   │   ├── db/
│   │   │   ├── migrations/     ordered .sql files, applied on boot
│   │   │   ├── index.ts        connection, re-entrant transactions, helpers
│   │   │   └── seed.ts         demo workspace
│   │   ├── routes/             one router per area, all tenant-scoped
│   │   ├── services/           villa creation, email delivery
│   │   ├── realtime/hub.ts     authenticated WebSocket fan-out
│   │   └── lib/                errors, validation, audit, notifications, dates
│   └── test/                   node:test suites over a real HTTP server
└── web/                        React 18 + TypeScript + Vite + Tailwind
    └── src/
        ├── context/            session and per-villa permission context
        ├── lib/                API client, realtime hook, formatting
        ├── components/         layout, shared UI
        └── pages/              one page per area
```

The server runs TypeScript directly through Node's type stripping — no build
step in development, and `tsc` for typechecking and production builds.
`erasableSyntaxOnly` is on, so nothing that needs a real transform can creep in.

### Tenancy

Every tenant-owned table carries `villa_id`. Every tenant-scoped route sits
behind `withVilla`, which resolves the caller's membership for the `:villaId` in
the path and attaches it to the request. Handlers filter on
`req.villa.villaId` — never on an id from the request body — so a villa you are
not a member of is unreachable regardless of what you send.

A villa you don't belong to answers **404, not 403**. A 403 would confirm the
villa exists.

### The permission model

A permission is `resource:action`, and where a capability can be limited to a
person's own records there is a matching pair:

```
tasks:view.all      see every task in the villa
tasks:view.own      see only tasks assigned to you
```

Handlers ask for the widest scope the caller holds and narrow the query
accordingly, so one endpoint serves a housekeeper and a manager correctly.

Effective permissions resolve as:

```
role permissions  ∪  per-member grants  −  per-member denials
```

Denial wins over everything, including the owner's wildcard — which is what lets
an owner carve one capability out of a deputy who otherwise inherits the lot.
Three rules keep a workspace from being locked out of itself:

- The seeded **owner role** cannot be narrowed, and the owner's own membership
  cannot be given denials.
- A new role that copies the owner gets every *concrete* permission, never the
  wildcard, so it can be narrowed later.
- Deleting a role that people hold requires naming the role they move to.

Changes take effect on the next request: permissions are resolved per request
from the database, never cached in the token.

### Approvals

Money and time off can't be self-approved. Blocking it in the route rather than
in the role means it holds even for an owner who has granted themselves
everything — the one case a role-based check would miss.

Expense categories can carry an auto-approval limit, so a manager isn't signing
off every bag of groceries while the pool pump repair still gets a look.

### Sessions

Short-lived JWT access tokens (15 minutes) held **in memory only** — never in
`localStorage`, so an XSS bug can't walk off with a long-lived credential.
Durability comes from an httpOnly, SameSite=Lax refresh cookie scoped to
`/api/auth`.

Refresh tokens rotate on every use and are stored hashed. A token replayed
after rotation revokes the entire session family, which is the standard response
to a leak. Because two tabs can legitimately present the same token at the same
instant, rotation has a 30-second grace window: a genuine race gets a fresh
token, a replay minutes later does not.

### Dates and timezones

Timestamps are stored in UTC; "today" is a question about the villa's own
calendar. Anything that groups shifts by day — the dashboard's on-shift list,
the payroll hours report — converts the villa's local day into UTC bounds and
compares a range, rather than using SQLite's `date()`, which would file a 06:00
shift in Bali under the previous day.

### Audit trail

Anything that moves money, changes access or alters the roster writes an
append-only `audit_log` row: who, what, when, and the before/after where it
matters. Visible in Settings to anyone with `audit:view`.

---

## Configuration

All settings live in `server/.env` — see `.env.example`. The `dev`, `start` and
`seed` scripts load it with Node's `--env-file-if-exists`, so the file is
optional but is read whenever it is present.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `4000` | |
| `DATABASE_PATH` | `./data/villa.sqlite` | `:memory:` is honoured for tests |
| `JWT_ACCESS_SECRET` | generated in dev | **Required in production** |
| `JWT_REFRESH_SECRET` | generated in dev | **Required in production** |
| `APP_URL` | `http://localhost:5173` | CORS origin and invitation links |
| `UPLOAD_DIR` | `./uploads` | Receipts and attachments |
| `MAX_UPLOAD_BYTES` | `10485760` | 10 MB |
| `SMTP_URL` | unset | Without it, invitation links are logged and returned in the UI |

In production the server refuses to boot if either secret is missing or left at
its sample value. In development it generates ephemeral ones, so `npm run dev`
works with no setup — at the cost of invalidating sessions on restart.

### Deployment

Push to `main` and GitHub Actions builds, tests, publishes a container image
and rolls it out to the server, rolling back automatically if the new build
does not come up healthy. Setup, secrets, rollback, backups and the HTTPS
switch are in [`deploy/README.md`](./deploy/README.md).

```bash
# One-time, on the server:
ssh root@YOUR_SERVER 'APP_DOMAIN=villa.example.com bash -s' < deploy/bootstrap.sh
# Then add the repository secrets listed in deploy/README.md and push to main.
```

Locally, the same stack runs with Docker:

```bash
cd deploy
cp ../.env.example .env     # then set the two JWT secrets
VILLA_SAYA_IMAGE=villa-saya:local docker compose up -d
```

### Running it yourself, without the pipeline

- Set both secrets, `NODE_ENV=production` and a real `APP_URL`.
- `npm run build`, then `npm start`. With `WEB_DIST` set, the server serves the
  built client itself, so the whole app runs on one origin and one port.
- Put it behind TLS. The refresh cookie sets `Secure` automatically in
  production; over plain HTTP that cookie is dropped and sign-in fails, so
  `COOKIE_SECURE=false` exists as a stopgap until a certificate is in place.
- SQLite in WAL mode is comfortable for the scale this app is for — a few
  villas, tens of staff. The data layer is plain SQL behind a small helper
  module, so moving to Postgres means changing that module and the migrations,
  not the routes.
- Back up the database file and `UPLOAD_DIR` together; receipts are referenced
  by rows in the database.

---

## API

All endpoints are under `/api`. Everything tenant-scoped is under
`/api/villas/:villaId/...` and requires an active membership.

<details>
<summary><strong>Full endpoint list</strong></summary>

### Authentication
| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/register` | Optionally with `villaName` (become an owner) or `invitationToken` (join a villa) |
| `POST` | `/auth/login` | |
| `POST` | `/auth/refresh` | Rotates the refresh cookie |
| `POST` | `/auth/logout` | |
| `GET` | `/auth/me` | Current user and their villas |
| `PATCH` | `/auth/me` | Name, phone, language |
| `POST` | `/auth/change-password` | Signs out every other device |
| `GET` | `/auth/invitations/:token` | Public preview of an invitation |
| `POST` | `/auth/invitations/:token/accept` | Accept while signed in |

### Villas, roles and people
| Method | Path | Permission |
| --- | --- | --- |
| `GET` | `/villas` | — |
| `POST` | `/villas` | — (creator becomes owner) |
| `GET` | `/villas/permissions` | The permission catalogue |
| `GET` `PATCH` `DELETE` | `/villas/:villaId` | `villa:view` / `villa:manage` / `villa:delete` |
| `GET` | `/villas/:villaId/audit` | `audit:view` |
| `GET` `POST` | `/villas/:villaId/roles` | `members:view` / `roles:manage` |
| `PATCH` `DELETE` | `/villas/:villaId/roles/:roleId` | `roles:manage` |
| `GET` | `/villas/:villaId/members` | `members:view` |
| `PATCH` | `/villas/:villaId/members/:id` | `members:manage` |
| `PUT` | `/villas/:villaId/members/:id/permissions` | `roles:manage` |
| `DELETE` | `/villas/:villaId/members/:id` | `members:remove` |
| `POST` | `/villas/:villaId/members/:id/transfer-ownership` | owner only |
| `GET` `POST` | `/villas/:villaId/invitations` | `members:invite` |
| `POST` | `/villas/:villaId/invitations/:id/resend` | `members:invite` |
| `DELETE` | `/villas/:villaId/invitations/:id` | `members:invite` |

### Operations
| Method | Path | Permission |
| --- | --- | --- |
| `GET` `POST` | `/villas/:villaId/tasks` | `tasks:view.*` / `tasks:create` |
| `GET` `PATCH` `DELETE` | `/villas/:villaId/tasks/:taskId` | scoped by `.all` / `.own` |
| `POST` | `/villas/:villaId/tasks/:taskId/comments` | task visibility |
| `PATCH` | `/villas/:villaId/tasks/:taskId/checklist/:itemId` | `tasks:update.*` |
| `GET` `POST` | `/villas/:villaId/roster` | `roster:view.*` / `roster:manage` |
| `PATCH` `DELETE` | `/villas/:villaId/roster/:shiftId` | `roster:manage` |
| `POST` | `/villas/:villaId/roster/publish` | `roster:publish` |
| `GET` | `/villas/:villaId/roster/swaps` | scoped |
| `POST` | `/villas/:villaId/roster/:shiftId/swap` | `roster:swap.request` |
| `POST` | `/villas/:villaId/roster/swaps/:id/decision` | `roster:swap.approve` |
| `GET` `POST` | `/villas/:villaId/leave` | `leave:view.*` / `leave:request` |
| `GET` `POST` `PATCH` | `/villas/:villaId/leave/types` | `leave:manage_types` |
| `GET` | `/villas/:villaId/leave/balances` | own, or `leave:view.all` |
| `PUT` | `/villas/:villaId/leave/allowances` | `leave:manage_types` |
| `POST` | `/villas/:villaId/leave/:id/decision` | `leave:approve` |
| `POST` | `/villas/:villaId/leave/:id/cancel` | own, or `leave:approve` |
| `GET` `POST` | `/villas/:villaId/expenses` | `expenses:view.*` / `expenses:submit` |
| `GET` `PATCH` `DELETE` | `/villas/:villaId/expenses/:claimId` | scoped |
| `POST` | `/villas/:villaId/expenses/:claimId/submit` \| `/withdraw` | claimant |
| `POST` | `/villas/:villaId/expenses/:claimId/decision` | `expenses:approve` |
| `POST` | `/villas/:villaId/expenses/:claimId/reimburse` | `expenses:reimburse` |
| `GET` `POST` `PATCH` | `/villas/:villaId/expenses/categories` | `expenses:manage_categories` |

### Collaboration
| Method | Path | Permission |
| --- | --- | --- |
| `GET` `POST` | `/villas/:villaId/messages/channels` | `messages:read` / `messages:manage_channels` |
| `POST` | `/villas/:villaId/messages/direct` | `messages:read` |
| `GET` `POST` | `/villas/:villaId/messages/channels/:id/messages` | `messages:read` / `messages:send` |
| `PATCH` `DELETE` | `/villas/:villaId/messages/channels/:id/messages/:msgId` | author, or `messages:moderate` |
| `POST` | `/villas/:villaId/messages/channels/:id/read` | `messages:read` |
| `POST` `GET` | `/villas/:villaId/files` \| `/files/:id` | `files:upload` / membership |
| `GET` `POST` | `/villas/:villaId/notifications` \| `/read` | membership |
| `GET` | `/villas/:villaId/reports/dashboard` | membership (content varies by permission) |
| `GET` | `/villas/:villaId/reports/expenses` \| `/hours` \| `/leave` | `reports:view` |

`WS /ws?token=<access token>` — realtime events, scoped to the villas the token
holder is an active member of.

</details>

### Uploads

Receipts are sent as a raw body with a `Content-Type` and `X-Filename` header —
one file per request, no multipart parser. Only JPEG, PNG, WebP, HEIC and PDF
are accepted, and files are always served back as `attachment` with
`nosniff`, so an uploaded file can never execute in the app's origin.

---

## Testing

```bash
npm test
```

90 tests over a real HTTP server and a fresh in-memory database per file:

| Suite | Covers |
| --- | --- |
| `tenancy.test.ts` | Cross-villa isolation, removed and suspended members, unauthenticated access |
| `permissions.test.ts` | Resolver semantics, live role edits, per-person exceptions, owner lock-out protection |
| `workflows.test.ts` | Expense approval and reimbursement, leave balances and half days, roster clashes and publishing, task scoping |
| `auth.test.ts` | Password hashing, refresh rotation, concurrent-refresh grace, replay detection, invitations |
| `messaging.test.ts` | Channel and DM privacy, unread counts, moderation |
| `reviewfixes.test.ts` | Regressions for the four issues raised in review: mention scope, dashboard permission gating, villa-local day boundaries |

The permission and tenancy suites are the ones to run first when changing
anything about access — they encode the rules the rest of the app depends on.

---

## Known limits

- **Recurring tasks** store a recurrence rule but do not yet generate future
  instances; the schema and validation are in place for it.
- **Rate limiting** is in-process, which is right for the single-node
  deployment this is built for but would need Redis behind a load balancer.
- **Email** falls back to logging unless `SMTP_URL` is set; invitation links are
  surfaced in the UI so this is workable, not a blocker.
- **Attachments** are stored on local disk under `UPLOAD_DIR`, partitioned by
  villa. Object storage would be a change to `routes/files.ts` only.
- **Indonesian** is selectable as a language preference but the interface
  strings are English.
