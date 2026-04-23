---
issue: FRD-157
review-rev: 01
reviewed-at: 2026-04-21T00:00:00Z
reviewer-posture: skeptical
verdict: approve
type: Bug
brief-rev: 2026-04-21-linear-read-once
---

# Verdict
**APPROVE.**

# 1. Well-formedness (Bug schema)
PASS.
- Frontmatter complete: `issue`, `issue-rev`, `groomed-at`, `trigger`, `type: Bug`, `reproduction-status: confirmed` — all present.
- All Bug-required sections present: Outcome, Acceptance Criteria, Scope Fence, Rabbit-Hole Patches, Blast-Radius Manifest, Skeleton Position, Concrete Example, Reproduction Steps, Root Cause, Failure Modes.
- `reproduction-status: confirmed` is justified inline ("static code inspection — no running Postgres, per testbed constraints"), with specific file:line evidence for each defect. Acceptable under the testbed constraint.

# 2. Groundedness
PASS. Every code citation in the brief verified against the pinned testbed (SHA 2edac08).

| Citation | Verified |
|---|---|
| `inbox.ts:13` — `new Hono<AuthEnv>()` | ✓ matches exactly |
| `inbox.ts:20-30` — `resolveWorkspace` helper, no workspace-scope guard | ✓ lines 20–30 are the helper; the missing `AND workspaceId = authSession.workspaceId` is real |
| `inbox.ts:33-58` — GET handler | ✓ |
| `inbox.ts:50-57` — GET WHERE filters on `clients.workspaceId`, not `inboxMessages.clientId` | ✓ confirmed, line 54 is `eq(clients.workspaceId, workspaceId)` |
| `inbox.ts:86-109` — PATCH handler; `inbox.ts:91-100` builds `workspaceClientIds` subquery and uses `IN` | ✓ exact text match |
| `inbox.ts:10-12` — file header comment "Workspace-scoped inbox…" | ✓ |
| `inbox.ts:23` — `authWorkspace` fallback when no `x-client-id` | ✓ |
| `inbox.test.ts:126-143` — current seed puts secondary client in DIFFERENT workspace | ✓ line 33 `workspaceId: secondaryWorkspaceId` confirms |
| `middleware/client.ts:17-19` — 400 `{ok:false, error:'No client selected'}` | ✓ |
| `middleware/client.ts:27-35` — enforces `clients.id = x AND clients.workspaceId = authSession.workspaceId`; 403 on miss | ✓ |
| `db/schema.ts:287-295` — `inbox_messages.client_id NOT NULL` + FK to `clients.id` | ✓ |
| `lib/inbox.ts:15-21` — writer inserts with `clientId` | ✓ |
| `activity.ts:8-11,21` — pattern to follow (`Hono<ClientEnv>`, `use(clientMiddleware)`, `eq(activityLog.clientId, clientId)`) | ✓ |
| `analytics.ts:12,24` — `use(clientMiddleware)` + `eq(transactions.clientId, clientId)` | ✓ |
| `index.ts:106` — `app.route('/api/v1/inbox', inboxApp)` is the only inbox mount | ✓; grep for `inbox` returns only the import at line 14 and the mount at line 106 (no SSE route) |
| Shared schema `packages/shared/src/schemas/index.ts:487-503` — `inboxClientSchema` + `inboxMessageSchema` with `client` field | ✓ |

- ACs are runnable: AC1–AC4 all point to a single concrete command (`cd app/backend && bun test src/routes/inbox.test.ts`) against the updated test file described in Blast-Radius. Verification is specific (two-client same-workspace seed, PATCH-ids-explicit, PATCH-ids-'all', cross-workspace 403).
- Blast-Radius is grep-verifiable: the two Always-touch files exist and are the right ones; every Never-touch path resolves to an existing file.

Minor observation (not a blocker): `transactions.ts:354-356` cited as a client-scoping exemplar points at an `activityLog.clientId` subquery inside the transaction detail handler rather than the transactions table filter itself; a tighter citation would be `transactions.ts:38` (`use(clientMiddleware)`) or line 43/147/195 (`const clientId = c.get('clientId')`). The underlying claim — that `transactions.ts` is client-scoped — is true.

# 3. Scope sanity
PASS.
- **No widening.** Always-touch is exactly 2 files (`inbox.ts`, `inbox.test.ts`). Never-touch explicitly fences off the middleware, schema, migrations, writer (`lib/inbox.ts`), metadata formatter, shared schemas, frontend, and every other route.
- **No TBDs / open questions.** Every rabbit-hole is decided with a direct answer and a file:line citation: keep the `client` response field, no migration needed, drop `resolveWorkspace`, `/api/v1/activity` is already correct, no SSE endpoint exists, missing `x-client-id` → 400 is the intended contract, no `requireRole` addition.
- **Bug-specific rules honored.** The fix is framed as a minimal re-pivot of two WHERE predicates + one Hono generic swap + deletion of a now-redundant helper — no refactors, no surrounding cleanup. The `innerJoin(clients, …)` is preserved to keep the response shape identical ("frontend contract unchanged"), matching "fix the leak, nothing else."
- **AC4 (cross-workspace 403) is not scope-widening.** It's an assertion about `clientMiddleware`'s existing behavior (`middleware/client.ts:33-34`) once the route mounts that middleware. The middleware is on Never-touch; only the test exercises the path.
- **Secondary contributor handled correctly.** `resolveWorkspace`'s missing workspace guard is not patched in-place; the primary fix (pivot to `clientMiddleware`) supersedes and deletes it. This is the simpler, root-cause fix and avoids leaving dead helper code.

# Summary
Brief is well-formed, every code citation resolves against SHA 2edac08, ACs are executable against a single updated test file, and scope is tightly fenced to `inbox.ts` + `inbox.test.ts` with all adjacent concerns (SSE, activity feed, migrations, role gating, response shape) explicitly and correctly deferred. Approved.
