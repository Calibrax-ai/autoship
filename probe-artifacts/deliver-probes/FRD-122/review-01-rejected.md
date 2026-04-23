---
issue: FRD-122
brief-rev: 2026-04-21-linear-read-once
reviewed-at: 2026-04-22
reviewer: review-01
verdict: approve-with-notes
---

# Verdict

**Approve with notes.** The brief is well-formed, substantially grounded, and picks the simplest reasonable alternative. Two factual inaccuracies should be fixed during implementation (neither is architectural) and one ancillary code surface was missed in Blast-Radius.

---

## 1. Well-formedness — PASS

Feature schema sections all present:

- Outcome ✓
- Acceptance Criteria (5 ACs, each with explicit verification command) ✓
- Scope Fence (Always-/Ask-/Never-touch with concrete paths) ✓
- Rabbit-Hole Patches (8 pre-resolved foot-guns) ✓
- Blast-Radius Manifest (Create/Change/May-change/Must-not-change) ✓
- Skeleton Position ✓
- Concrete Example (three requests with expected shapes) ✓
- Failure Modes (5 scenarios, each marked intended/accepted) ✓
- Design Rationale with Alternatives (A/B/C) and Picked+Reason ✓
- Backward Compatibility ✓ (required because spec changes an existing handler)
- Deferred ✓ (required because scope trims were made)

No missing conditional subsections relative to the blast radius.

---

## 2. Groundedness — MOSTLY PASS (two factual errors)

### Cited file:line spot-checks (all verified against SHA 2edac08)

| Citation | Brief claim | Actual | Verdict |
|---|---|---|---|
| `transactions.ts:698,704-716,719,721` | handler structure | matches | ✓ |
| `transactions.ts:699` | reads `clientId` only | `const clientId = c.get('clientId')` | ✓ |
| `transactions.ts:728` | `c.get('userId' as never) as string \| undefined` pattern | confirmed at 473, 659, 728 | ✓ |
| `transactions.ts:686-691` | restore loop logs `status_change` per id | matches exactly | ✓ |
| `transactions.ts:516,546,636,687,752,769` | sibling `transaction.*` logActivity calls | all six lines present and match | ✓ |
| `middleware/require-role.ts:24-34` | `requireRole` factory | matches | ✓ |
| `middleware/require-role.ts:30` | `{ ok: false, error: 'Insufficient permissions' }` | matches | ✓ |
| `auth.ts:116` | dev-bypass role default `'admin'` | matches | ✓ |
| `auth.ts:121,146` | `c.set('userId', authSession.userId)` both branches | matches | ✓ |
| `gl-external.ts:64` | `glExternalApp.use('*', requireRole('member'))` | matches | ✓ |
| `rbac.test.ts:11-30,43-59` | request helper + member/manager POST /clients | matches | ✓ |
| `activity.ts:20,24` | `event_type` filter on activity feed | matches | ✓ |
| `lib/activity.ts:14-21` | `logActivity` signature, no transaction | matches | ✓ |
| `db/schema.ts:119` | `gl_posted boolean default false` | matches | ✓ |
| `auth/permissions` ROLE_HIERARCHY | admin > manager > member | `admin:3, manager:2, member:1` — `requireRole('manager')` admits admin+manager, blocks member | ✓ |

### Factual errors found

**(E1) Seed claim contradicts the existing test file.** Blast-Radius Manifest says "the test file already inserts an eligible AP `PENDING_PAID` row (`transactions.test.ts:60-66`)." It doesn't. That row has `glPosted: true` (line 65), which makes it **ineligible** under the handler's `(gl_posted IS NULL OR gl_posted = false)` predicate. The Concrete Example correctly notes "seed adds a second AP row with … `glPosted: false` for a flip count of 1" — so the brief is internally inconsistent. Implementer must add a seeded AP row with `glPosted: false` (or null) for AC2's "`posted >= 1`" assertion to be deterministic.

**(E2) Missed surface: `GET /:id/history` via `toEditHistoryEntry`.** The brief claims that new `event_type` values "render generically on the frontend without any mapping" citing `activity.ts:26-42`. That's true for `GET /api/v1/activity`, but `GET /api/v1/transactions/:id/history` (`transactions.ts:452-466`) runs rows through `toEditHistoryEntry` (`transactions.ts:23-34`), whose fallthrough branch relabels any unknown event as `field: '__deleted__'`. New `transaction.gl_post` rows will render on the per-transaction edit-history surface as if they were soft-deletes. This is in `transactions.ts` (always-touch) and the mapper either needs an explicit `gl_post` branch or the brief should explicitly defer this to a follow-up (it currently defers only frontend rendering of the activity feed, which is a different surface).

### Alternatives not strawman — PASS

- **B (schema columns):** legitimate — cites real migration cost per `backend/CLAUDE.md` DB-migrations contract; raises real backfill-NULL concern.
- **C (both):** slightly weaker but valid; surfaces a real "two sources of truth" drift concern.
- Neither is a strawman.

### ACs runnable — PASS

All five ACs point to `bun test src/routes/transactions.test.ts`. AC1–AC4 are concrete and mechanically verifiable. AC5 preserves the existing green test. Caveat: AC2's numeric claim (`posted` equals N eligible rows) depends on the seed fix in E1.

### Blast-radius grep-verifiable — PASS

All "Must not change" file paths exist; all "Expected to change" line ranges are real; role-gate placement pattern (`.post(path, requireRole('manager'), handler)`) is demonstrated in-tree at `clients.ts:31` (even closer precedent than `gl-external.ts:64` which the brief cites).

---

## 3. Scope Sanity — PASS

### Picked alternative is simplest reasonable

A reuses two existing primitives (`requireRole`, `logActivity`) with zero schema change. Concrete cost: +1 import, +1 positional middleware arg, +1 read of `userId` from context, +3-line post-update loop, ≥4 new test cases. Matches six existing `transaction.*` logActivity precedents in the same file.

### Substantially-simpler-alternative check

I considered three simpler options:

1. **Batch-level activity row** (one INSERT with `{ postedIds: [...] }` payload). Addressed and rejected in Rabbit-Hole Patches with valid reasoning: every other mutation in this file logs per-entity, and the activity feed renders per-entity. The per-id loop is the convention, not over-engineering. Reasonable rejection.
2. **Role gate only, skip attribution.** Fails the stated outcome ("record who posted and when"). Not viable.
3. **Wrap UPDATE + logActivity inserts in `db.transaction`.** Not simpler, more complex. Brief correctly defers this under Failure Modes citing sibling consistency.

No substantially simpler alternative survives the outcome + convention constraints. A is minimal.

### No over-engineering — PASS

- No new files (test changes go into the existing `transactions.test.ts`).
- No new middleware (`requireRole` already exists and is used elsewhere).
- No new helper (`logActivity` called directly, same as siblings).
- No schema change, no migration, no journal entry.
- No shared-schema edit (response shape preserved).
- No cross-cutting refactor.

### One minor over-scoping flag

The brief suggests adding `db.delete(activityLog).where(eq(activityLog.clientId, clientId))` to `afterAll`. Pre-existing PATCH tests (`status_change`, `field_edit`, `soft_delete`, `review_approve`) already insert activity_log rows during this suite — the current `afterAll` silently eats the FK-constraint error via `try/catch` (line 120). Adding the cleanup is correct, but the brief should note this is a pre-existing cleanup gap that the new code exposes further, not net-new.

---

## Required fixes before execution

1. **Fix E1:** Either (a) add a seeded AP row with `status: 'PENDING_PAID', glPosted: false` in `beforeAll`, or (b) rewrite AC2 to accept `posted >= 0` with an explicit post-condition check on a test-created row. The Concrete Example assumes (a); align Blast-Radius accordingly.
2. **Resolve E2:** Decide explicitly whether to (a) extend `toEditHistoryEntry` with a `transaction.gl_post` branch (small, same file, still minimal) or (b) formally defer per-transaction history rendering of the new event type in Deferred. Current silence leaves a latent misrender regression.

## Suggested improvements (non-blocking)

- Cite `clients.ts:31` as the nearest in-tree precedent for the `.post(path, requireRole('manager'), handler)` inline-middleware shape. `gl-external.ts:64` uses `use('*', ...)` — correct pattern family but not the exact shape being applied here.
- Note that `afterAll` currently swallows cleanup errors; the `activityLog` delete should be appended before the `clients` delete so the client row actually gets removed post-change.

## Final verdict

**Approve with notes.** Architectural direction is sound, minimal, and follows in-tree convention. Fix E1 and E2 before coding.
