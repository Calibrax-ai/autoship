---
issue: FRD-122
issue-rev: 2026-04-21-linear-read-once
groomed-at: 2026-04-22T12:00:00Z
trigger: regroom
type: Feature
design-status: proposed
revisions:
  - 2026-04-22T12:00:00Z — regroom addressing review-01: fixed E1 (seed claim) via new seeded row, fixed E2 (silent `__deleted__` misrender) via extending `toEditHistoryEntry`, added AC6, retargeted Skeleton citation to `clients.ts:31`, clarified `afterAll` FK ordering.
---

# Outcome
`POST /api/v1/transactions/post-to-gl` rejects non-privileged callers with 403 and, on success, writes a per-transaction `transaction.gl_post` entry to `activity_log` capturing who posted and when.

# Acceptance Criteria
- AC1 — `POST /api/v1/transactions/post-to-gl` with role `member` returns `403 { ok: false, error: 'Insufficient permissions' }` and no `transactions.gl_posted` row flips from `false` to `true`. Verification: `cd app/backend && bun test src/routes/transactions.test.ts` (new case added; see Blast-Radius).
- AC2 — `POST /api/v1/transactions/post-to-gl` with role `manager` returns `200 { ok: true, posted: <N> }` where `N` equals the count of eligible AP `PENDING_PAID` rows with `(gl_posted IS NULL OR gl_posted = false)` and no conflict (unchanged predicate from `transactions.ts:704-716`). Verification: same test file.
- AC3 — `POST /api/v1/transactions/post-to-gl` with role `admin` returns `200` identically (hierarchy `admin > manager`, per `middleware/require-role.ts:24-34`). Verification: same test file.
- AC4 — For each row flipped by AC2/AC3, exactly one `activity_log` row exists with `event_type = 'transaction.gl_post'`, `entity_type = 'transaction'`, `entity_id = <transaction.id>`, `actor_user_id = c.get('userId')`, `client_id = c.get('clientId')`, and a `payload` that includes the posting timestamp (`{ "postedAt": <ISO string> }`). Verification: same test file (select `activity_log` by `(clientId, eventType, entityId)` after the POST).
- AC5 — Existing `POST /post-to-gl marks pending AP transactions as gl_posted` test at `transactions.test.ts:294-303` still passes without modification beyond (if needed) making its assertion numerically tighter; the dev-bypass caller already receives role `admin` via `auth.ts:116` so the role gate is satisfied. Verification: same test file.
- AC6 — `GET /api/v1/transactions/:id/history` for a transaction flipped by AC2/AC3 returns an entry for the `transaction.gl_post` row whose `field` is **not** `'__deleted__'` (e.g. `field: 'gl_posted'` with `oldValue: 'false'`, `newValue: 'true'`, or `field: 'gl_post'` with `newValue` = the ISO `postedAt`). Rationale: the fallthrough branch of `toEditHistoryEntry` (`transactions.ts:32-33`) currently relabels any unknown `event_type` as a soft-delete; extending the mapper is required to avoid a silent misrender regression on the per-transaction history surface. Verification: same test file — call `GET /api/v1/transactions/:id/history` with the flipped `id` after the manager POST in AC2 and assert `entries.some(e => e.field !== '__deleted__' && (e.field === 'gl_posted' || e.field === 'gl_post'))`.

# Scope Fence
Always-touch:  `app/backend/src/routes/transactions.ts`, `app/backend/src/routes/transactions.test.ts`
Ask-first:     (none)
Never-touch:   `app/backend/src/middleware/auth.ts`, `app/backend/src/middleware/client.ts`, `app/backend/src/middleware/require-role.ts`, `app/backend/src/lib/activity.ts`, `app/backend/src/db/schema.ts`, `app/backend/drizzle/migrations/**`, `app/backend/src/auth/**`, `app/packages/shared/src/schemas/**`, `app/frontend/**`, every other `app/backend/src/routes/*.ts` file, `app/e2e/**`.

# Rabbit-Hole Patches
- "Does the new `transaction.gl_post` event render correctly on the per-transaction history endpoint?" — **No, not without a mapper extension.** `GET /api/v1/transactions/:id/history` (`transactions.ts:452-466`) routes activity_log rows through `toEditHistoryEntry` (`transactions.ts:23-34`), whose final fallthrough branch (lines 32-33) relabels ANY unrecognized `event_type` as `field: '__deleted__'` with the payload's `snapshot`/`reason` packed as old/new values. Without a new branch, posted transactions would appear in their own history as soft-deletes — a silent regression. Decision: **extend the mapper** in this issue (option A from review-01, §E2). Add a branch for `event_type === 'transaction.gl_post'` that returns a non-`__deleted__` shape (e.g. `{ field: 'gl_posted', oldValue: 'false', newValue: 'true' }` or `{ field: 'gl_post', oldValue: null, newValue: payload.postedAt }`). `transactions.ts:23-34` is added to Always-touch. AC6 enforces this. The alternative — formally deferring the misrender to a follow-up — was rejected because the fix is one branch in a file already being edited; deferring leaves a user-visible regression unnecessarily.
- "Does the activity-feed endpoint (`GET /api/v1/activity`) need changes?" — No. That endpoint returns raw `eventType` strings (`activity.ts:26-42`) and does not pass rows through a branching mapper. Unknown event types render as their literal strings on that surface — any frontend styling is out of scope (frontend testbed fence). Only the per-transaction history endpoint collapses unknown types into `__deleted__`.
- "Which minimum role — `manager` or `admin`?" — `manager`. The issue body says "manager/admin roles"; in the hierarchy `admin > manager > member` (`auth/permissions`, re-exported at `middleware/require-role.ts:10`), `requireRole('manager')` admits both admin and manager and blocks member. This matches the `POST /api/v1/clients` posture exercised in `rbac.test.ts:43-59` (member 403, manager 200), which is the closest existing control-gap precedent.
- "Apply the role gate app-wide on `transactionsApp` or per-route?" — Per-route. `transactionsApp` has 30+ handlers that must remain callable by members (GET list, GET detail, PATCH edits, approve/reject review). Widening the gate would break existing behavior and widen scope. Apply `requireRole('manager')` inline to the single POST handler at `transactions.ts:698`. This is how `gl-external.ts:64` already scopes a role gate to one mount without disturbing siblings.
- "Add `gl_posted_by` / `gl_posted_at` columns on `transactions`?" — No (deferred). The issue asks "record who posted and when," not "expose per-row posting attribution in the transactions table." `activity_log` already stores `actor_user_id` + `created_at` + arbitrary `payload`, and every sibling mutation in this file (`field_edit`, `status_change`, `soft_delete`, `review_approve`, `review_reject`) captures attribution through that channel. Adding columns would require a Drizzle schema change + numbered migration + journal entry (per `app/backend/CLAUDE.md` "DB Migrations (CRITICAL)") for the same observable outcome. See Design Rationale §Deferred.
- "One `activity_log` row per transaction, or one per batch?" — Per transaction. The sibling soft-delete path loops and logs per `id` (`transactions.ts:686-691`) because each transaction has identity and the activity feed (`activity.ts:14-63`) renders per-entity rows. A batch-level event would be the only entry in the file that does not follow this shape.
- "Does the handler currently read `c.get('userId')`?" — It reads `clientId` only (`transactions.ts:699`). `userId` is already set on context by `authMiddleware` (`auth.ts:121,146`) and is consumed by sibling handlers as `c.get('userId' as never) as string | undefined` (`transactions.ts:728`). Reuse that pattern — no middleware change.
- "Should the response include posting attribution?" — No. Response contract stays `{ ok: true, posted: <N> }`. The frontend is out of scope (per testbed constraints), and no shared schema in `packages/shared/` describes this response. The audit trail is readable via `GET /api/v1/activity` (which already filters `event_type`, `activity.ts:20,24`).
- "Do we need a migration?" — No. `transactions.gl_posted boolean` already exists (`db/schema.ts:119`), and `activity_log` already accepts `event_type` as a free-form `text` column. Zero schema change.
- "Conflict with FRD-157 testbed pinning (SHA 2edac08)?" — No. FRD-157's `Never-touch` fences off `activity.ts`, `inbox.ts`, and inbox-related files; `transactions.ts` is not in either brief's Always-touch. The two briefs touch disjoint files.

# Blast-Radius Manifest
Expected to create:  (none — existing `app/backend/src/routes/transactions.test.ts` is the right host for the new assertions)
Expected to change:
- `app/backend/src/routes/transactions.ts` — two edits, both in this file:
  1. **POST `/post-to-gl` handler (lines 696–722):** (a) insert `requireRole('manager')` as an inline middleware argument between the path and the handler, (b) read `userId = c.get('userId' as never) as string | undefined` alongside `clientId`, (c) after the `UPDATE … RETURNING` returns the posted `id`s, loop `logActivity(clientId, 'transaction.gl_post', 'transaction', id, userId, { postedAt: new Date().toISOString() })` — mirroring `transactions.ts:686-691`. Add the `requireRole` import next to existing imports (line 1–12 block).
  2. **`toEditHistoryEntry` mapper (lines 23–34):** add a branch for `row.eventType === 'transaction.gl_post'` that returns a non-`__deleted__` shape. Concrete suggestion: `return { id: row.id, field: 'gl_posted', oldValue: 'false', newValue: 'true', actorUserId: row.actorUserId, createdAt: row.createdAt }` — this mirrors the `status_change` branch's `{ field, oldValue, newValue }` shape (line 30) and avoids inventing a new frontend-facing key. Place the branch above the fallthrough at line 32. This is the E2 fix from review-01 — without it, `GET /:id/history` (`transactions.ts:452-466`) silently mislabels posted transactions as soft-deletes.
- `app/backend/src/routes/transactions.test.ts` — edits:
  1. **Seed an additional AP row in `beforeAll`** with `status: 'PENDING_PAID'`, `glPosted: false` (E1 fix from review-01). The existing row at `transactions.test.ts:60-66` has `glPosted: true`, making it INELIGIBLE under the handler's `(gl_posted IS NULL OR gl_posted = false)` predicate (`transactions.ts:704-716`). Add a sibling row in the same `.values([...])` array — e.g. `seriesId: 'TXN-AP-002'`, `documentNumber: 'BILL-002'`, `counterparty: 'Vendor Y'`, same `status: 'PENDING_PAID'`, NO `glPosted` (defaults to `false` per `db/schema.ts:119`). Capture its id for direct assertions (`apPostableId`).
  2. **Add new test cases** inside the existing `describe('transaction routes', ...)` (alongside the AP posting test at lines 292–303): member 403 (asserts no flip, no activity_log row); manager 200 + `posted >= 1` (deterministic against the new `TXN-AP-002` row); `activity_log` row exists for `apPostableId` with correct `event_type = 'transaction.gl_post'`, `entity_id`, `actor_user_id`, and `payload` containing `postedAt`; `GET /api/v1/transactions/:id/history` for `apPostableId` returns an entry with `field !== '__deleted__'` (AC6 — E2 regression guard); existing admin-via-dev-bypass case still green. Follow `rbac.test.ts:11-30` for the `role:`-parameterized request helper — inline a small variant within this file rather than importing from `rbac.test.ts` (which stays untouched).

May change:
- `app/backend/src/routes/transactions.test.ts` imports — add `activityLog` to the `import { ... } from '../db/schema'` block (currently at lines 5–13) and add a best-effort `db.delete(activityLog).where(eq(activityLog.clientId, clientId))` to the `afterAll` cleanup (`transactions.test.ts:110-121`). **FK ordering:** insert this delete BEFORE the `clients` delete at line 119 — `activity_log.client_id` FKs to `clients.id`, so deleting `clients` first fails the constraint and the existing `try/catch` (line 120) would silently leave rows behind. Note this is a pre-existing cleanup gap (prior PATCH tests already write `activity_log` rows via sibling handlers and rely on cascade/try-swallow); the new code makes the gap more visible but does not introduce it.

Must not change:
- `app/backend/src/middleware/require-role.ts`, `app/backend/src/middleware/client.ts`, `app/backend/src/middleware/auth.ts` — used as-is.
- `app/backend/src/lib/activity.ts` — `logActivity` signature and behavior unchanged.
- `app/backend/src/db/schema.ts`, `app/backend/drizzle/migrations/**`, `app/backend/drizzle/migrations/meta/_journal.json` — no schema or migration changes.
- `app/backend/src/routes/gl.ts`, `app/backend/src/routes/gl-external.ts`, `app/backend/src/routes/reconciliation.ts` — these also insert into `glJournal` but via separate flows (bank-reconciliation settlements, not the AP "mark as posted" batch); not in issue scope.
- `app/packages/shared/src/schemas/**` — the response shape `{ ok, posted }` is unchanged.
- Every other `app/backend/src/routes/*.ts`, `app/frontend/**`, `app/e2e/**`, `app/backend/src/routes/rbac.test.ts` (preserve as the shared RBAC regression suite).

# Skeleton Position
Single-slice. Three patterns composed, all already exemplified in-tree:

1. **Inline role gating at a single handler** — closest in-tree precedent is `clients.ts:31`:
   ```ts
   clientsApp.post('/', requireRole('manager'), zValidator('json', createClientSchema), async (c) => { … })
   ```
   This is the exact `.post(path, requireRole('manager'), handler)` positional-middleware shape we want. (`gl-external.ts:64` uses `glExternalApp.use('*', requireRole('member'))` — same pattern family, but gates the whole sub-app rather than one route; `clients.ts:31` is the more direct template.) Hono accepts any number of middlewares between path and handler. Target shape:
   ```ts
   transactionsApp.post('/post-to-gl', requireRole('manager'), async (c) => { … })
   ```
2. **Attribution via activity log** — pattern at `transactions.ts:686-691` (the restore-from-delete loop):
   ```ts
   for (const id of deletedIds) {
     await logActivity(clientId, 'transaction.status_change', 'transaction', id, userId, { oldStatus: 'DELETED', newStatus: 'PENDING_REVIEW' })
   }
   ```
   The `/post-to-gl` handler already does a `.returning({ id: transactions.id })` (`transactions.ts:719`), so the posted ids are in hand; iterate them with `logActivity(..., 'transaction.gl_post', ..., { postedAt })`.
3. **Event-type branch in `toEditHistoryEntry`** — pattern at `transactions.ts:29-30` (status_change branch):
   ```ts
   if (row.eventType === 'transaction.status_change' || row.eventType === 'transaction.review_approve') {
     return { id: row.id, field: 'status', oldValue: p.oldStatus ?? null, newValue: p.newStatus ?? null, actorUserId: row.actorUserId, createdAt: row.createdAt }
   }
   ```
   Add an analogous branch for `transaction.gl_post` above the fallthrough at line 32. Keeps the per-transaction history surface honest without touching the fallthrough's soft-delete/review-reject semantics.

# Concrete Example
Pre-state — existing seed at `transactions.test.ts:60-66` has one AP row with `status: 'PENDING_PAID'`, `glPosted: true` (INELIGIBLE under the handler's `(gl_posted IS NULL OR gl_posted = false)` predicate). Per the E1 fix in Blast-Radius, the regroom adds a second AP row in `beforeAll` with `status: 'PENDING_PAID'`, `glPosted: false` (captured as `apPostableId`), giving a deterministic flip count of 1:

Request A — member blocked:
```
POST /api/v1/transactions/post-to-gl
Headers: x-dev-bypass: 1, x-dev-workspace-id: W1, x-client-id: C1, x-dev-role: member
```
Expected: `403 { ok: false, error: 'Insufficient permissions' }`. No `transactions.gl_posted` flip. No `activity_log` row.

Request B — manager succeeds:
```
POST /api/v1/transactions/post-to-gl
Headers: x-dev-bypass: 1, x-dev-workspace-id: W1, x-client-id: C1, x-dev-role: manager
```
Expected: `200 { ok: true, posted: 1 }`. The one eligible AP row flips `gl_posted` from `false`→`true`. Exactly one new `activity_log` row: `{ client_id: C1, event_type: 'transaction.gl_post', entity_type: 'transaction', entity_id: <that row's id>, actor_user_id: <the dev-bypass userId for W1>, payload: '{"postedAt":"<ISO>"}' }`.

Request C — admin succeeds identically:
```
POST /api/v1/transactions/post-to-gl
Headers: x-dev-bypass: 1, x-dev-workspace-id: W1, x-client-id: C1 (x-dev-role omitted → defaults to 'admin', auth.ts:116)
```
Expected: same 200 shape; if run sequentially after Request B, `posted: 0` (nothing left to flip) — assert on `data.posted >= 0` to tolerate ordering.

# Failure Modes
- **Activity-log write fails mid-batch.** `logActivity` performs a separate `INSERT` per id outside a transaction (`lib/activity.ts:14-21`, not inside a `db.transaction` block). If the loop is interrupted, `transactions.gl_posted` is already `true` but some `activity_log` rows may be absent. Consistent with sibling handlers (`transactions.ts:686-691` has the same shape for status restores). Accepted — do NOT wrap in a `db.transaction` (see "Never-touch" on cross-cutting refactors); recording is best-effort and the row-level `gl_posted` flag is the system of record.
- **Clerk session carries role that doesn't normalize.** `normalizeRole` returns `undefined` for unknown strings; `requireRole` then short-circuits to 403 (`middleware/require-role.ts:29-31`). Intended — callers with a misconfigured role see `Insufficient permissions`, same as `member`.
- **Empty result.** `UPDATE … RETURNING` returns `[]` when zero rows qualify (e.g., nothing in `PENDING_PAID`). The loop is a no-op and the response is `{ ok: true, posted: 0 }`. No `activity_log` rows written. Intended.
- **Dev-bypass role regression.** `auth.ts:116` defaults `x-dev-role` to `'admin'` when missing. Existing `authedRequest` helpers across the test suite (e.g., `transactions.test.ts:26-32`) do NOT set `x-dev-role`, so they land as admin and pass `requireRole('manager')`. Verified against auth middleware; no other test files require changes.
- **`requireRole('manager')` also admits admin.** Per hierarchy — intended. Matches `POST /api/v1/clients` at the RBAC boundary (`rbac.test.ts:52-58`).

# Design Rationale

## Alternatives

**A — Role gate at the handler + attribution via `activity_log` + one-branch extension to `toEditHistoryEntry` (PICKED).**
- Cost: small. One import in `transactions.ts`, one positional middleware argument on the POST, one post-update loop (~3 lines), one new branch in `toEditHistoryEntry` (~3 lines above the fallthrough), five new test cases. Zero schema change, zero migration.
- Two event-type surfaces to handle:
  - `GET /api/v1/activity` (`activity.ts:26-42`) — returns raw `eventType` strings without a branching mapper, so new types render as their literal string. No change needed here; any frontend styling is out of scope (frontend testbed fence).
  - `GET /api/v1/transactions/:id/history` (`transactions.ts:452-466`) — runs rows through `toEditHistoryEntry` (`transactions.ts:23-34`), whose fallthrough branch (line 32-33) relabels unknown `event_type` values as `field: '__deleted__'`. **This is why the mapper extension is in scope** — without it, posted transactions would appear in their own history as soft-deletes. A single branch keyed on `event_type === 'transaction.gl_post'` resolves this, stays within the already-Always-touched file, and is covered by AC6.
- Fit: matches the existing in-file audit convention (`transactions.ts:516,546,636,687,752,769` all log `transaction.*` events for mutations). Role gate shape mirrors `clients.ts:31` (the nearest inline-middleware precedent) and is exercised by `rbac.test.ts:43-59`.
- Tradeoff: posting attribution lives in `activity_log`, not on the `transactions` row. Querying "who last posted this row" is a join, not a direct column read. Acceptable because the product question ("who posted and when") is a historical audit question, not a live UI column — and the audit feed is already the user-facing surface for that question (`activity.ts:14-63` with an `event_type` filter).

**B — Role gate at the handler + schema columns `gl_posted_by` + `gl_posted_at` on `transactions`.**
- Cost: high. Drizzle schema edit in `db/schema.ts` + new numbered migration SQL + `meta/_journal.json` entry (all three steps required, per `app/backend/CLAUDE.md` "DB Migrations (CRITICAL)"). Handler must `.set({ glPosted: true, glPostedBy: userId, glPostedAt: new Date() })`. Typecheck both ends. Backfill question for existing `gl_posted = true` rows (which have NULL attribution).
- Fit: the columns are grep-answerable without a join; frontends that want a "Posted by Jane on 2026-04-22" badge get it for free.
- Tradeoff: schema surface grows for a need that `activity_log` already serves. The `issue.md` body asks to "Record who posted and when" — it does not demand inline columns. Backfill for pre-existing `gl_posted = true` rows would leave NULL attribution, which users may misread as "posted by nobody" in any column view the frontend adds later. Rejected as scope creep for the stated outcome.

**C — Role gate at the handler + both (`activity_log` entry AND new columns).**
- Cost: highest — all of B's migration + journal cost plus the loop from A. Two sources of truth for posting attribution.
- Fit: most complete audit.
- Tradeoff: duplication invites drift (one path could succeed while the other fails), and the failure mode is silent (a missing activity row or a null column). Rejected — single source of truth via `activity_log` is cleaner and mirrors how every other `transaction.*` mutation is recorded in this file.

## Picked + Reason
**A.** It captures both control-gap requirements (role gate + attribution) by composing two existing primitives — `requireRole` and `logActivity` — with zero schema change. Every design decision (event type naming, per-id loop, reading `userId` from context) follows a pattern already in `transactions.ts`, which keeps the diff small, the reviewer's job narrow, and the regression surface confined to one handler.

## Backward Compatibility
- Clerk tokens whose role normalizes to `member` (non-manager, non-admin) transition from "success 200" to "403 Insufficient permissions" on this endpoint. Intended per issue scope ("Ensure the endpoint fails clearly for unauthorized users"). No compatibility shim — this is the new contract.
- Response shape `{ ok: true, posted: <N> }` is unchanged for authorized callers. No frontend contract drift.
- Callers relying on `{ ok: false, error: <string> }` error shape continue to see that shape on 403 (produced by `middleware/require-role.ts:30`).
- Existing `gl_posted = true` rows created before this change carry no `activity_log` entry. That is intentional — we are not backfilling history.

## Deferred
- **Inline columns (`gl_posted_by` / `gl_posted_at`) on `transactions`.** If a future story needs per-row attribution visible in list/detail UIs without joining `activity_log`, add them then, with an explicit backfill strategy for pre-existing posted rows. See Alternative B.
- **Transactional atomicity of the UPDATE + activity-log writes.** Not wrapped in `db.transaction`; consistent with every sibling mutation in `transactions.ts`. Revisit only if a concrete audit-miss incident surfaces. See Failure Modes.
- **Separate event types for admin vs manager.** Not needed; the `actor_user_id` + the user's stored role on the `users` row is sufficient to reconstruct which tier acted.
- **Activity-feed (`GET /api/v1/activity`) frontend rendering of the new `transaction.gl_post` type.** Out of scope (frontend). The backend `activity.ts:26-42` returns the raw `eventType` string; any frontend styling is a separate concern. NOTE: the per-transaction history surface (`GET /api/v1/transactions/:id/history`) is **not** deferred — it's fixed in-scope via the `toEditHistoryEntry` mapper extension (see Blast-Radius, Skeleton Position §3, and AC6).
- **Role gating on `GET /api/v1/transactions/gl` (`routes/gl.ts`), `GET /entries`, `GET /export`.** These are read-only and not mentioned by the issue. Deferred.
- **Role gating on GL settlements inserted via `reconciliation.ts:1139,1358,1410`.** Separate flow (bank-match auto-settle), distinct control surface, not in issue scope.
