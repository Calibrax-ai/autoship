---
issue: FRD-157
issue-rev: 2026-04-21-linear-read-once
groomed-at: 2026-04-21T00:00:00Z
trigger: first-groom
type: Bug
reproduction-status: confirmed
---

# Outcome
`/api/v1/inbox` GET and PATCH are strictly scoped to the selected client entity (`x-client-id`), matching the activity feed's scoping posture; no cross-entity rows are read or mutated.

# Acceptance Criteria
- AC1 — `GET /api/v1/inbox` with `x-client-id = A` returns only rows where `inbox_messages.client_id = A`, even when another client `B` in the same workspace has non-archived messages. Verification: `cd app/backend && bun test src/routes/inbox.test.ts` (test suite updated to seed two clients in the same workspace and assert B's row is absent from A's response; see Blast-Radius below).
- AC2 — `PATCH /api/v1/inbox` with `x-client-id = A` and `ids: 'all'` only mutates rows where `client_id = A`. Client B's messages (same workspace, non-archived) remain `archived = false` / `read = false`. Verification: same test file, PATCH-then-select-by-client-B assertion.
- AC3 — `PATCH /api/v1/inbox` with `x-client-id = A` and an explicit `ids: [<id of B's message>]` does not mutate B's row (the predicate rejects out-of-scope ids). Verification: same test file, explicit-id PATCH assertion.
- AC4 — `GET`/`PATCH /api/v1/inbox` with `x-client-id` pointing to a client outside the caller's authenticated workspace returns `403 { ok: false, error: 'Client not found or access denied' }` (enforced by `clientMiddleware`). Verification: same test file, cross-workspace request case.

# Scope Fence
Always-touch:  `app/backend/src/routes/inbox.ts`, `app/backend/src/routes/inbox.test.ts`
Ask-first:     (none)
Never-touch:   `app/backend/src/middleware/auth.ts`, `app/backend/src/middleware/client.ts`, `app/backend/src/middleware/require-role.ts`, `app/backend/src/db/schema.ts`, `app/backend/drizzle/migrations/**`, `app/backend/src/lib/inbox.ts` (writer already tags `client_id`), `app/backend/src/lib/inbox-metadata.ts`, `app/packages/shared/src/schemas/index.ts`, `app/frontend/**`, `app/backend/src/routes/activity.ts`, all other route files.

# Rabbit-Hole Patches
- "Should the response keep the `client` field on each `InboxMessage` (shared schema at `app/packages/shared/src/schemas/index.ts:487-503`)?" — Yes. Preserve the existing shape so the frontend contract is unchanged; the value will trivially equal the selected client after the fix. Removing it is a separate concern and out of scope.
- "Do we need a data migration or backfill?" — No. `inbox_messages.client_id` is already `NOT NULL` with a FK to `clients.id` (`app/backend/src/db/schema.ts:287-295`), and every writer (`app/backend/src/lib/inbox.ts:15-21`) passes a concrete `clientId`. The bug is read-side only; data is already partitioned.
- "Do we need to keep `resolveWorkspace`?" — No. `clientMiddleware` (`app/backend/src/middleware/client.ts:27-35`) already enforces `clients.id = x-client-id AND clients.workspaceId = authSession.workspaceId`, which is strictly stronger than what `resolveWorkspace` computes and is the correct primitive for this route. Remove the helper.
- "Is the activity feed (`/api/v1/activity`) part of this bug?" — No. `app/backend/src/routes/activity.ts:10-11,21` already applies `clientMiddleware` and filters by `eq(activityLog.clientId, clientId)`. The customer-reported "activity leak" is the inbox notifications surface; the activity feed endpoint is correct.
- "Should SSE/live inbox updates be re-scoped in the same change?" — Out of scope: there is no inbox SSE endpoint in `app/backend/src/index.ts` (search: `app.route('/api/v1/inbox', inboxApp)` at `app/backend/src/index.ts:106` is the only mount). `lib/sse.ts` is used elsewhere; do not touch.
- "What about `PATCH` when `x-client-id` is missing?" — After the fix `clientMiddleware` returns 400 `{ ok: false, error: 'No client selected' }` (client.ts:17-19). This matches every other client-scoped route and is the intended contract.
- "Does `requireRole` need to be applied like on `/api/v1/activity`?" — No. The current inbox route has no role gate; preserving that behavior is in scope ("fix the leak, nothing else"). Adding a role gate is a separate issue.

# Blast-Radius Manifest
Expected to create:  (none — existing `app/backend/src/routes/inbox.test.ts` is the right host for the new assertions)
Expected to change:  `app/backend/src/routes/inbox.ts` (re-home on `clientMiddleware`; filter both handlers by `eq(inboxMessages.clientId, c.get('clientId'))`; delete `resolveWorkspace`), `app/backend/src/routes/inbox.test.ts` (seed two clients in the SAME workspace; assert per-client visibility for GET, PATCH-ids-explicit, PATCH-ids-'all'; add a cross-workspace 403 case).
May change:          (none)
Must not change:     `app/backend/src/middleware/auth.ts`, `app/backend/src/middleware/client.ts`, `app/backend/src/middleware/require-role.ts`, `app/backend/src/db/schema.ts`, `app/backend/drizzle/migrations/**`, `app/backend/src/lib/inbox.ts`, `app/backend/src/lib/inbox-metadata.ts`, `app/backend/src/lib/sse.ts`, `app/packages/shared/src/schemas/index.ts`, `app/backend/src/routes/activity.ts`, `app/backend/src/routes/*.ts` (any other route), `app/frontend/**`, `app/e2e/**`.

# Skeleton Position
Single-slice. Pattern to follow: `app/backend/src/routes/activity.ts:8-11` (`new Hono<ClientEnv>()` + `activityApp.use('*', clientMiddleware)`) and `app/backend/src/routes/activity.ts:21` (`const conditions = [eq(activityLog.clientId, clientId)]`). `inboxApp` should be re-typed to `Hono<ClientEnv>`, mount `clientMiddleware` at the top, and both the GET and PATCH predicates should pivot from `clients.workspaceId = <resolved>` to `inboxMessages.clientId = c.get('clientId')`. The existing `innerJoin(clients, ...)` can remain to hydrate `client.shorthand/name` for the response.

# Concrete Example
Seed (same workspace W1):
- Client A (`ITP`), one non-archived `scan` message "Invoice for A".
- Client B (`ITS`), one non-archived `scan` message "Invoice for B".

Request:
```
GET /api/v1/inbox
Headers: x-dev-bypass: 1, x-dev-workspace-id: W1, x-client-id: A
```

Observed today (evidence — `app/backend/src/routes/inbox.ts:50-57`): response `messages` contains BOTH "Invoice for A" and "Invoice for B" because the `WHERE` predicate is `clients.workspaceId = W1`, not `inboxMessages.clientId = A`.

Expected after fix: response `messages` contains ONLY "Invoice for A".

PATCH request:
```
PATCH /api/v1/inbox  body: { action: 'archive', ids: 'all' }
Headers: x-dev-bypass: 1, x-dev-workspace-id: W1, x-client-id: A
```

Observed today (evidence — `app/backend/src/routes/inbox.ts:91-100`): both A's and B's messages flip to `archived = true` because the predicate expands to every client in W1.

Expected after fix: only A's messages flip to `archived = true`; B's row is untouched.

# Reproduction Steps
Command:
```
grep -n "workspaceId" app/backend/src/routes/inbox.ts
grep -n "clientId\|c.get('clientId')" app/backend/src/routes/inbox.ts
grep -n "clientMiddleware\|c.get('clientId')\|ClientEnv" app/backend/src/routes/activity.ts
cat app/backend/src/routes/inbox.ts
```

Observed (static code inspection — no running Postgres, per testbed constraints):
- `app/backend/src/routes/inbox.ts:13` declares `new Hono<AuthEnv>()`, not `Hono<ClientEnv>()`. The route never mounts `clientMiddleware`.
- `app/backend/src/routes/inbox.ts:33-58` (GET `/`): filters rows via `and(eq(clients.workspaceId, workspaceId), eq(inboxMessages.archived, false))`. There is no `inboxMessages.clientId = <selected entity>` predicate, despite the caller passing `x-client-id`.
- `app/backend/src/routes/inbox.ts:86-109` (PATCH `/`): builds `workspaceClientIds = (SELECT clients.id WHERE workspace_id = <workspaceId>)` and applies `inboxMessages.clientId IN workspaceClientIds`. PATCH therefore mutates every client's rows in the workspace, not just the selected entity's.
- `app/backend/src/routes/inbox.ts:20-30` (`resolveWorkspace`): when `x-client-id` is present, it does `SELECT workspace_id FROM clients WHERE id = <x-client-id>` and returns that workspace — **without** requiring the client to belong to `authSession.workspaceId`. A caller supplying any client UUID from another workspace receives that workspace's inbox.
- `app/backend/src/routes/inbox.test.ts:126-143` seeds the secondary client in a DIFFERENT workspace, so the existing test only proves cross-workspace isolation given `x-dev-workspace-id = primaryWorkspaceId`. It does NOT exercise two clients in the SAME workspace, which is the exact scenario Ethan is reporting; the bug therefore passes the current test suite.
- Writer side is already client-correct (`app/backend/src/lib/inbox.ts:15-21` inserts with `clientId`; `app/backend/src/db/schema.ts:287-295` requires `client_id NOT NULL` with FK). The leak is read/mutate-side.

Expected (per issue body): "Recent activities and all data should be strictly scoped to the currently selected entity. No data from other entities should be visible or accessible."

Reproduction-status rationale: the missing-scope defect is evident in code (GET and PATCH predicates filter on `clients.workspaceId`, never on `inboxMessages.clientId`). Per testbed constraints, static inspection suffices to classify as `confirmed`.

# Root Cause
Primary — `app/backend/src/routes/inbox.ts:50-57` (GET `/`):
```ts
.from(inboxMessages)
.innerJoin(clients, eq(clients.id, inboxMessages.clientId))
.where(
  and(
    eq(clients.workspaceId, workspaceId),
    eq(inboxMessages.archived, false),
  ),
)
```
Primary — `app/backend/src/routes/inbox.ts:91-100` (PATCH `/`):
```ts
const workspaceClientIds = sql`(
  SELECT ${clients.id} FROM ${clients} WHERE ${clients.workspaceId} = ${workspaceId}
)`
const baseConditions = [sql`${inboxMessages.clientId} IN ${workspaceClientIds}`]
```

Causal chain: both handlers deliberately aggregate across the entire workspace (see the file header comment at `app/backend/src/routes/inbox.ts:10-12`: "Workspace-scoped inbox: aggregates messages across every client in the caller's workspace. Each row carries its client metadata so the UI can show a client badge and offer a client filter."). This predates the tenant-isolation requirement stated in FRD-157; the design assumption — "a workspace is the tenancy boundary" — is no longer correct. The selected entity (`x-client-id`) is the tenancy boundary, matching every other client-scoped route in the codebase (e.g., `app/backend/src/routes/activity.ts:10-11,21`, `app/backend/src/routes/analytics.ts:12,24`, `app/backend/src/routes/transactions.ts:354-356`). The inbox is the outlier.

Secondary contributor — `app/backend/src/routes/inbox.ts:20-30` (`resolveWorkspace`): derives the target workspace from the caller-supplied `x-client-id` via `SELECT workspace_id FROM clients WHERE id = <header>` without an `AND workspace_id = authSession.workspaceId` constraint. This turns a caller-controlled header into workspace authority, so even the workspace-wide read is itself attackable with a foreign `clientId`. The primary fix — pivot to `clientMiddleware` — supersedes and deletes this helper; `clientMiddleware` already enforces the missing join at `app/backend/src/middleware/client.ts:27-35`.

# Failure Modes
- Callers relying on "all workspace messages visible from any entity" lose that aggregate view. This is the intended behavior change and the purpose of the fix; no compatibility shim.
- `PATCH ids: 'all'` previously archived the whole workspace's non-archived inbox; after the fix it archives only the selected entity's. Intended.
- Requests without `x-client-id` previously returned workspace-wide data via the `authWorkspace` fallback (`app/backend/src/routes/inbox.ts:23`); after the fix `clientMiddleware` returns 400 `{ ok: false, error: 'No client selected' }`. Intended — matches `activity.ts`, `analytics.ts`, `transactions.ts`.
- Cross-workspace `x-client-id` probes (secondary contributor) will transition from "leak that workspace's inbox" to 403 `Client not found or access denied` via `clientMiddleware`. Intended.
- Existing `app/backend/src/routes/inbox.test.ts` passes today against the buggy implementation because it only seeds clients in separate workspaces; updating the seeds to place A and B in the same workspace will cause the current test to fail, which is the desired regression guard (AC1–AC3).
