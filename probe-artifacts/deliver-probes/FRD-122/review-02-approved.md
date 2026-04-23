---
issue: FRD-122
brief-rev: 2026-04-22-regroom-01
reviewed-at: 2026-04-22
reviewer: review-02
verdict: approve
---

# Verdict

**Approve.** Both review-01 blockers are addressed. The brief is well-formed, grounded against SHA 2edac08, and has not widened scope beyond the single-branch mapper extension that was already in `Always-touch`. No remaining blocking issues.

---

## Review-01 blocker resolution

### E1 — Ungrounded seed claim — FIXED

Old brief asserted `transactions.test.ts:60-66` was an eligible AP `PENDING_PAID` row. It isn't (`glPosted: true`, line 65, verified). The regroom:

- Explicitly calls the row out as **INELIGIBLE** under the handler's `(gl_posted IS NULL OR gl_posted = false)` predicate at `transactions.ts:704-716` (Blast-Radius, test edit #1; Concrete Example pre-state paragraph).
- Prescribes adding a sibling AP row with `seriesId: 'TXN-AP-002'`, `status: 'PENDING_PAID'`, omitting `glPosted` (defaults to `false` per `db/schema.ts:119` — verified).
- Captures `apPostableId` so AC4 and AC6 can assert on a specific row rather than "some posted row", and makes AC2's `posted: 1` deterministic (see Concrete Example Request B).
- AC2 was tightened to "`posted: <N>` where N equals the count of eligible AP rows" — aligned with the new seed.

Verified: `db/schema.ts:119` default-false confirmed. No other test-file state conflicts with the new row (the row is scoped to this suite's `clientId`, cleaned by the existing `afterAll` `transactions` delete at line 116).

### E2 — Silent regression on `GET /:id/history` — FIXED (Option A)

Old brief claimed new `event_type` values render generically. False for this surface: `toEditHistoryEntry` (`transactions.ts:23-34`, verified) relabels any unknown `eventType` as `field: '__deleted__'` at the fallthrough (line 33). The regroom:

- Adds a Rabbit-Hole Patches entry that names the surface (`GET /api/v1/transactions/:id/history`, `transactions.ts:452-466` — verified), cites the offending fallthrough at `transactions.ts:32-33`, and picks Option A explicitly (extend the mapper) with reasoning (one branch in a file already in Always-touch; deferring leaves a user-visible regression).
- Adds `transactions.ts:23-34` to the Blast-Radius `Expected to change` list as edit #2, with a concrete shape mirroring the `status_change` branch at `transactions.ts:29-30` (verified).
- Skeleton Position §3 shows the pattern with a direct line quote from the `status_change` branch.
- **AC6** adds mechanical verification: `GET /api/v1/transactions/:id/history` for the flipped `apPostableId` must return an entry with `field !== '__deleted__'`. The assertion is flexible across the two suggested mapper shapes (`field: 'gl_posted'` or `field: 'gl_post'`), giving the implementer latitude without weakening the regression guard.

This is the E2 fix review-01 asked for. No latent misrender left in the per-transaction history surface.

---

## 1. Well-formedness — PASS

All Feature-schema sections still present post-regroom:

- Frontmatter: `trigger: regroom` ✓, `revisions` log describes E1/E2/AC6/Skeleton/afterAll changes ✓, `design-status: proposed` ✓, `issue-rev` unchanged (Linear body unchanged, correct).
- Outcome, Acceptance Criteria (now 6 ACs, each with `bun test src/routes/transactions.test.ts`), Scope Fence, Rabbit-Hole Patches (8 entries, with the new history-surface entry promoted to first), Blast-Radius Manifest, Skeleton Position (3 patterns, including new mapper-branch pattern), Concrete Example (pre-state paragraph updated for E1), Failure Modes, Design Rationale with Alternatives A/B/C, Backward Compatibility, Deferred. All present.
- AC6 is mechanically verifiable and points to the same test host file as AC1–AC5.
- Revisions log accurately summarizes the four changes (E1, E2, AC6, `clients.ts:31` retarget, afterAll ordering).

---

## 2. Groundedness — PASS

Re-verified all citations the regroom added or moved, against SHA 2edac08:

| Citation | Claim | Verified |
|---|---|---|
| `transactions.ts:23-34` | `toEditHistoryEntry` mapper | ✓ function body matches verbatim |
| `transactions.ts:29-30` | `status_change` / `review_approve` branch returns `{ field: 'status', oldValue, newValue, ... }` | ✓ |
| `transactions.ts:32-33` | fallthrough returns `field: '__deleted__'` | ✓ line 32 is the `// soft_delete and review_reject` comment, line 33 returns `{ field: '__deleted__', ... }` |
| `transactions.ts:452-466` | `GET /:id/history` maps `activityLog` rows through `toEditHistoryEntry` | ✓ |
| `transactions.ts:516,546,636,687,752,769` | six sibling `transaction.*` `logActivity` calls | ✓ all six verified (`field_edit`, `status_change`, `soft_delete`, `status_change` in restore, `review_approve`, `review_reject`) |
| `transactions.ts:686-691` | restore loop logs per-id | ✓ |
| `transactions.ts:698,699,704-716,719` | handler structure, clientId-only read, predicate, RETURNING | ✓ |
| `transactions.ts:728` | `c.get('userId' as never) as string \| undefined` pattern | ✓ |
| `transactions.test.ts:60-66` | existing AP row with `glPosted: true` | ✓ verbatim |
| `transactions.test.ts:110-121` | `afterAll` with `try { … } catch {}` | ✓ verified; no current `activityLog` delete; `clients` delete is at line 119 |
| `transactions.test.ts:294-303` | existing `POST /post-to-gl` test | ✓ |
| `clients.ts:31` | `.post('/', requireRole('manager'), zValidator(...), handler)` | ✓ verbatim — this is the right precedent for the new positional middleware shape |
| `db/schema.ts:119` | `glPosted: boolean('gl_posted').default(false)` | ✓ |
| `middleware/require-role.ts:24-34` | `requireRole` factory with 403 and hierarchy check | ✓ |
| `lib/activity.ts:14-21` | `logActivity` signature, no wrapping transaction | ✓ |

No ungrounded claims remaining. The AP-specific `activityLog` delete in `afterAll` is correctly framed as "pre-existing cleanup gap, new code makes it more visible" — matches the actual state (the current suite already writes `activityLog` rows via `PATCH` handlers and relies on the `try/catch` to swallow the FK error).

---

## 3. Scope Sanity — PASS

### Picked alternative still simplest reasonable

Alternative A (role gate + activity_log attribution + one mapper branch) remains minimal:

- `transactions.ts`: +1 import (`requireRole`), +1 positional middleware arg, +1 `userId` read, ~3-line post-update loop, ~3-line mapper branch.
- `transactions.test.ts`: +1 seeded row, +1 `activityLog` import, +5 new test cases, +1 `activityLog` delete in `afterAll`.
- Zero schema change, zero migration, zero journal entry, zero shared-schema edit.

### Is the E2 mapper extension scope creep?

**No.** The file was already in `Always-touch` for the role-gate and activity-log edits. Adding one event-type branch that mirrors the existing `status_change` branch (3 lines, same shape, same file, same logical layer) is strictly smaller than the alternative review-01 offered (defer the misrender to a follow-up), which would require a second issue, a second brief, and a known-broken interim state. The Rabbit-Hole Patches entry captures this reasoning explicitly.

### Over-engineering check

- No new files.
- No new helpers.
- No cross-cutting refactor (e.g., wrapping the UPDATE + log inserts in `db.transaction` — correctly deferred under Failure Modes + Deferred, matching sibling convention).
- No unnecessary response-shape change — `{ ok, posted }` preserved.
- AC6 uses a flexible matcher (`field !== '__deleted__'`) that doesn't over-constrain the mapper's exact shape.

### No substantially simpler alternative

Same conclusion as review-01: batch-row logging, role-gate-only, and transactional wrapping are all either rejected convention-violations or no-simpler-just-different. The regroom doesn't unlock a new simpler path.

---

## Final verdict

**Approve.** Both review-01 blockers (E1 seed, E2 `__deleted__` misrender) are fixed with grounded in-tree precedents. No remaining issues. Ready for execution.
