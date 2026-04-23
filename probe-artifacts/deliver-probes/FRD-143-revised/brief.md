---
issue: FRD-143
issue-rev: 2026-04-21-linear-read-once
groomed-at: 2026-04-22T00:00:00Z
trigger: first-groom
type: Feature
design-status: need-info
---

# Outcome
Admin/manager-managed, entity-level (client-level) access control so non-admin users only see authorized clients and their data across all client-scoped endpoints.

# Scope classification

**This issue is multi-slice and cannot be groomed as a single brief.** Three distinct forks live in the issue body itself, each resolving to different file sets, schemas, and acceptance criteria:

1. **Data-model fork (issue open question #1):** "per user, per team, or role plus entity membership." These are three structurally different schemas:
   - *Per user:* `user_client_grants(userId, clientId)` — fine-grained ACL.
   - *Per team:* new `teams` + `team_memberships` + `team_client_grants` — two new tables, plus migration of today's flat memberships into teams.
   - *Role + entity membership:* augment `workspace_memberships` with a `clientId` scope (make role-per-client instead of role-per-workspace) — touches the existing `workspace_memberships` table, changes its unique constraint, and forks the meaning of every `requireRole(...)` call in the codebase.
   The fork is not cosmetic; it determines which tables exist and which middleware contracts change. No existing pattern in `app/backend/src/` commits to one of these shapes, so you cannot default-pick.

2. **Enforcement-breadth fork (issue open question #2):** "whether entity visibility also gates uploads, reviews, bank recon, and reports." The codebase has ~20 route modules mounted through `clientMiddleware` (`activity`, `analytics`, `transactions`, `reconciliation`, `gl`, `extraction`, `folder-upload`, `gdrive`, `email`, `conflicts`, `customers`, `fx-rates`, `inbox`, `files`, `subledger-external`, `gl-external`, `coa`, `folder-upload`) plus `GET /api/v1/clients` which bypasses `clientMiddleware`. Adding the grant check to `clientMiddleware` covers all 20 in one shot, but the list endpoint in `clients.ts` and any write that touches another client (e.g. `POST /clients`, `DELETE /clients/:id`) need separate handling. The question "does this gate writes too?" is not resolvable from the issue.

3. **Admin UX fork (issue open question #3):** "admin UX for assigning and auditing access." Requires its own CRUD API surface (grant/revoke, list grants per user, list users per client, audit log). Shape depends entirely on fork #1 — you cannot design this API without knowing the grant model.

# Proposed decomposition

Split FRD-143 into three sub-issues on Linear and re-dispatch each individually:

- **FRD-143a — Access-control data model + decision.** Resolve open question #1 with the customer. Decide: per-user grants, per-team grants, or role+entity on `workspace_memberships`. Deliverable: schema migration + types + seed fixtures + one enforcement helper (e.g. `userCanAccessClient(userId, clientId)`). No route changes yet. Single-slice once the data-model question is answered.

- **FRD-143b — Enforcement across client-scoped routes.** Resolve open question #2 with the customer (gate reads only, or reads + writes? Specifically: does a manager without grant still see a client in `GET /api/v1/clients`? Can they `POST /api/v1/extract` against it?). Deliverable: (a) augment `clientMiddleware` in `app/backend/src/middleware/client.ts` to check the grant helper from 143a, (b) filter `GET /api/v1/clients` in `app/backend/src/routes/clients.ts` to only grants the caller has. Single-slice — one chokepoint plus one list endpoint. Depends on 143a merging first.

- **FRD-143c — Admin grant-management API.** Deliverable: CRUD endpoints for grants (shape depends on 143a). Likely `POST /api/v1/access-grants`, `DELETE /api/v1/access-grants/:id`, `GET /api/v1/access-grants?userId=...&clientId=...`, gated by `requireRole('admin')` (or `manager`, pending customer input). Audit trail via existing `activityLog` pattern. Depends on 143a merging first; independent of 143b for development (API can land before enforcement flips on, behind a feature flag or simply as dark-launched data).

# Why it can't be single-sliced

A single brief would have to pre-commit to one answer for each of three open questions the issue explicitly flags as unresolved. That is the pre-groomer picking the product's governance model — outside this role. The operator (or customer) must resolve at least question #1 before an executor can produce a schema; questions #2 and #3 can be resolved in parallel with 143a. The three sub-issues compose cleanly: 143a lands the primitive, 143b and 143c consume it independently.

# What each sub-issue would cover (preview — do NOT execute from this brief)

## 143a (data model)
- Must-touch: `app/backend/src/db/schema.ts` (new table[s] or modified `workspace_memberships`), a new migration file, and one helper module (likely `app/backend/src/auth/access-control.ts` or extension of `app/backend/src/auth/permissions.ts`).
- Decision record in the brief: which of the three shapes, cited against similar precedents in the repo (`workspace_memberships` as the existing per-workspace pattern is the nearest reference).

## 143b (enforcement)
- Must-touch: `app/backend/src/middleware/client.ts` (add grant check after client lookup); `app/backend/src/routes/clients.ts` (filter `GET /` to granted clients for non-admin callers).
- Must decide: whether `requireRole('admin')` callers bypass grants (likely yes — admins see everything). Whether `manager` callers bypass grants or are themselves subject to them (open; ask).
- Reference pattern: current `clientMiddleware` does workspace-membership enforcement — the grant check plugs in at the same seam immediately after the existing `clients.workspaceId` check.
- Blast radius: every route currently under `clientMiddleware` (listed above) inherits the check for free. No per-route changes needed if the chokepoint is used correctly.

## 143c (admin API)
- Must-touch: new route module `app/backend/src/routes/access-grants.ts`, wire-up in `app/backend/src/index.ts`.
- Reference pattern: `app/backend/src/routes/clients.ts` — same shape for a workspace-scoped CRUD resource with `requireRole(...)` gating and `logActivity` emissions.
- Audit: use existing `activityLog` table with a new `entityType: 'access_grant'`.

# Operator action

Split FRD-143 into FRD-143a / 143b / 143c on Linear (or rename 143 → 143a and create 143b/143c), resolve open question #1 with the customer on 143a, then re-dispatch each sub-issue to the pre-groomer. Do not execute against this brief.

# Evidence cited

- Issue body: `app/.autoship/issues/FRD-143/issue.md` lines 20–33 (three open questions, three requested outcomes).
- Chokepoint: `app/backend/src/middleware/client.ts:14–42` (single `clientMiddleware` mounted via `.use('*', clientMiddleware)` across ~20 route modules).
- Mounted routes: `app/backend/src/index.ts:94–115`.
- List endpoint that bypasses `clientMiddleware`: `app/backend/src/routes/clients.ts:18–28` (`GET /api/v1/clients` filters only by `workspaceId`).
- Existing role hierarchy: `app/backend/src/middleware/require-role.ts` (admin > manager > member); used by `clients.ts:31,57,93`, `activity.ts:11`, and others.
- Nearest existing precedent for a per-user scoped membership: `workspace_memberships` at `app/backend/src/db/schema.ts:48–59` — per-workspace, not per-client.
