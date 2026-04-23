---
issue: REF-001
issue-rev: 2edac08-issue-v1
groomed-at: 2026-04-22T00:00:00Z
trigger: first-groom
type: Refactor
preservation-status: needs-coverage-first
---

# Outcome

Extract the upload idempotency admission ladder and the failed-400 completion pattern into one shared helper module in `backend/src/lib/`, so `extraction.ts` and `reconciliation.ts` each compose one call instead of open-coding the 3-branch ladder and the failed-400 persistence block.

# Acceptance Criteria

- AC1 — `POST /api/v1/extract` with a reused idempotency key and a different request fingerprint returns HTTP 409 with exactly `{ ok: false, error: 'Idempotency key has already been used for a different upload', code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' }`. Verification: `cd app/backend && bun test src/routes/upload-idempotency.test.ts -t 'rejects extraction key reuse for a different payload'`.
- AC2 — `POST /api/v1/bank-statements` with a reused idempotency key and a different request fingerprint returns HTTP 409 with exactly the same mismatch body shape as AC1. Verification: new regression test `rejects bank key reuse for a different payload` in `upload-idempotency.test.ts`.
- AC3 — `POST /api/v1/extract` during an in-progress earlier request with the same key returns HTTP 409 with `{ ok: false, error: 'This upload is already being processed', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', jobId: <originalJobId> }`. Verification: `bun test src/routes/upload-idempotency.test.ts -t 'returns 409 with the existing job id while extraction upload is in progress'`.
- AC4 — `POST /api/v1/bank-statements` in the same in-progress scenario returns 409 with the same body shape as AC3 and carries the originally-attached bank `jobId`. Verification: new regression test `returns 409 with the existing job id while bank upload is in progress` in `upload-idempotency.test.ts`.
- AC5 — A completed extraction upload replays byte-identical body + status on retry with the same key. Verification: `bun test src/routes/upload-idempotency.test.ts -t 'replays extraction upload responses for the same key'`.
- AC6 — A completed bank upload replays byte-identical body + status on retry with the same key. Verification: `bun test src/routes/upload-idempotency.test.ts -t 'replays bank upload responses for the same key'`.
- AC7 — A validation-400 failure (invalid `direction` on extract, or empty files on either route) persists `status='failed'`, `responseStatus=400`, and `responseBody=JSON.stringify(payload)` under the idempotency key, and a same-key retry replays that exact 400 body without re-validating. Verification: new regression test `replays persisted 400 failures for the same key` in `upload-idempotency.test.ts` (covers extract invalid direction + extract empty fileList + bank empty validFiles).
- AC8 — Both routes, when called without an `Idempotency-Key` header, still succeed (200) and emit a `warn`-level log via `logger.child({ route: <routeKey> })` with payload `{ clientId, direction, fileCount }` for extract and `{ clientId, fileCount }` for bank. Verification: new regression test `emits soft-rollout warn with route-specific fields when key is missing` in `upload-idempotency.test.ts`, stubbing `logger.warn` and asserting call arguments.
- AC9 — No diff outside the three files listed in the Blast-Radius Manifest (plus the one test file). Verification: `git diff --name-only 2edac08...HEAD -- app/backend/` shows only the enumerated paths.
- AC10 — Full backend test suite green pre- and post-refactor. Verification: `cd app/backend && bun test` exits 0.

# Scope Fence

Always-touch:  `backend/src/routes/extraction.ts`, `backend/src/routes/reconciliation.ts`, one new helper file under `backend/src/lib/` (suggested: `backend/src/lib/upload-idempotency.ts`), and `backend/src/routes/upload-idempotency.test.ts` (for the new regression tests that fill AC2/AC4/AC7/AC8 coverage gaps).
Ask-first:     None. The boundary is clean — no other call sites use the admission ladder.
Never-touch:   `backend/src/lib/idempotency.ts` (primitive helpers are already factored — the refactor is one layer above), the DB schema, `migrations/`, Clerk/auth middleware, `backend/src/services/extraction.ts`, `backend/src/services/matcher.ts`, `backend/src/services/bank.ts`, `backend/src/lib/idempotency.test.ts`, the frontend (`app/frontend/`), any other route file, any other lib file, any config.

# Rabbit-Hole Patches

- "Should the new helper also own the *success* completion (the `completeIdempotentRequest(..., 'completed', 200, ...)` call site on each route)?" — No. The issue scopes the refactor to the admission ladder + failed-400 completion. Success completions live inside route-specific try blocks next to route-specific payload construction (`result` for extract, `{ files, inserted, duplicates, total, matchesFound, matching, skippedFiles, errors }` for bank), and extracting them forces the helper to accept two different result shapes. Leave them in the routes.
- "Should the new helper also own the *500 failure* completion in the outer catch?" — No. Same scope argument; the issue enumerates exactly three failed-400 sites. The 500 path is one line (`if (idempotencyRequestId) await completeIdempotentRequest(..., 'failed', 500, ...)`) already, with no ladder shape to dedupe.
- "Should `handleUploadBankStatement` move out of `reconciliation.ts` while we're refactoring it?" — No. That is a separate issue; REF-001 does not authorize moving route handlers between files.
- "Does the helper need to handle the `idempotencyKey === undefined` branch (soft rollout) or does the route keep that branch?" — The route keeps the header-parse + no-key branch because the warn-log payload fields are route-specific (`direction` only exists on extract). The helper is only called when `idempotencyKey` is present. The downstream completion-helper is called conditionally on `idempotencyRequestId` being non-null, matching today's behavior.
- "Does the helper return a `Response` (Hono-shaped) or a plain object the route turns into a Response?" — Up to the executor; both shapes preserve observable behavior. Match whichever is cleanest — the admission ladder today returns `c.json(...)` (a Hono `Response`) for mismatch/processing and `replayIdempotentResponse(...)` (a raw `Response`) for replay. Returning `Response` directly is consistent with `replayIdempotentResponse` already in the primitives module.
- "Does the helper need to know the route key as a const at call site, or should it be derivable?" — Call site passes it explicitly. `routeKey` is already a parameter to `beginIdempotentRequest` and must be one of `'extract_upload' | 'bank_statement_upload'`; the helper just forwards it.
- "Is it safe to let the helper emit the soft-rollout warn?" — The issue invariant says the warn's *log payload shape* must not change. The warn call itself may move into the helper (the issue explicitly permits this). But the payload fields differ per route (extract: `{ clientId, direction, fileCount }`; bank: `{ clientId, fileCount }`), so either (a) the helper accepts a `warnFields: Record<string, unknown>` parameter, or (b) the warn call stays at the route call site. (b) is simpler; prefer it unless the executor sees a cleaner (a).

# Blast-Radius Manifest

Expected to create:  `backend/src/lib/upload-idempotency.ts` (verified absent via `ls`).
Expected to change:  `backend/src/routes/extraction.ts`, `backend/src/routes/reconciliation.ts`, `backend/src/routes/upload-idempotency.test.ts` (add regression tests for AC2, AC4, AC7, AC8 per Preservation Proof).
May change:          None. The refactor is physically contained to the admission ladder + failed-400 sites; callers of `extractionApp` / `reconciliationApp` (see `backend/src/index.ts`) see no API change.
Must not change:     `backend/src/lib/idempotency.ts`, `backend/src/lib/idempotency.test.ts`, DB schema + migrations, `backend/src/services/*`, `backend/src/middleware/*`, all other `backend/src/routes/*` files, all other `backend/src/lib/*` files, `app/frontend/`, `package.json` (no new deps).

# Skeleton Position

Single-slice. One helper module, two call sites. The new module lives one abstraction layer above `backend/src/lib/idempotency.ts` — same shape as how `backend/src/lib/jobs.ts` sits above `backend/src/db/schema.ts`. The admission helper composes `beginIdempotentRequest` + `replayIdempotentResponse` (both from `idempotency.ts`) into one ladder call. The failed-400 helper wraps `completeIdempotentRequest` + `c.json(payload, 400)` into one call. The refactor is strictly mechanical — no policy changes, no new state.

# Concrete Example

**Before (extraction.ts:1193–1236, 1238–1252 — abbreviated):**

```ts
let idempotencyRequestId: string | null = null
if (idempotencyKey) {
  const idempotency = await beginIdempotentRequest({ clientId, routeKey: 'extract_upload', idempotencyKey, requestFingerprint: fingerprint })
  if (idempotency.kind === 'mismatch') return c.json({ ok: false, error: 'Idempotency key has already been used for a different upload', code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' }, 409)
  if (idempotency.kind === 'processing') return c.json({ ok: false, error: 'This upload is already being processed', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', jobId: idempotency.jobId }, 409)
  if (idempotency.kind === 'replay') return replayIdempotentResponse(idempotency)
  idempotencyRequestId = idempotency.requestId
} else {
  extractionLogger.warn('Upload request missing idempotency key during soft rollout', { clientId, direction: rawDirection, fileCount: extractionInputs.length })
}

if (direction !== 'AR' && direction !== 'AP' && direction !== 'AUTO') {
  const payload = { ok: false, error: 'direction must be AR, AP, or AUTO' }
  if (idempotencyRequestId) await completeIdempotentRequest(idempotencyRequestId, 'failed', 400, JSON.stringify(payload))
  return c.json(payload, 400)
}
```

**After (executor decides exact signature — this is illustrative, not prescriptive):**

```ts
// backend/src/lib/upload-idempotency.ts  (new)
export type AdmissionOutcome =
  | { kind: 'admitted', requestId: string | null }   // requestId null when no key (soft rollout)
  | { kind: 'short-circuit', response: Response }     // caller returns this directly

export async function admitUpload(params: {
  clientId: string
  routeKey: IdempotencyRouteKey
  idempotencyKey: string | undefined
  requestFingerprint: string
}): Promise<AdmissionOutcome> { ... }

export async function failWith400(
  c: Context, requestId: string | null, payload: Record<string, unknown>,
): Promise<Response> {
  if (requestId) await completeIdempotentRequest(requestId, 'failed', 400, JSON.stringify(payload))
  return c.json(payload, 400)
}
```

```ts
// extraction.ts (call site)
const admission = await admitUpload({ clientId, routeKey: 'extract_upload', idempotencyKey, requestFingerprint: fingerprint })
if (admission.kind === 'short-circuit') return admission.response
const idempotencyRequestId = admission.requestId
if (!idempotencyKey) extractionLogger.warn('Upload request missing idempotency key during soft rollout', { clientId, direction: rawDirection, fileCount: extractionInputs.length })

if (direction !== 'AR' && direction !== 'AP' && direction !== 'AUTO') {
  return failWith400(c, idempotencyRequestId, { ok: false, error: 'direction must be AR, AP, or AUTO' })
}
```

The executor owns the exact signature; this example only illustrates the reduction: 6 ladder sites → 1 helper + 2 call sites; 3 failed-400 blocks → 1 helper + 3 call sites.

# Behavior Preservation

## What must be preserved

- **Observable:**
  - HTTP status codes: 409 for mismatch, 409 for processing, replay returns the originally persisted status, 400 for invalid direction / empty files, 200 for successful upload, 500 for internal errors — unchanged.
  - Response bodies — exact key order does not matter (JSON is unordered) but exact keys, values, and types must match:
    - Mismatch: `{ ok: false, error: 'Idempotency key has already been used for a different upload', code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' }`.
    - Processing: `{ ok: false, error: 'This upload is already being processed', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', jobId: <string | null> }`.
    - 400 extract invalid direction: `{ ok: false, error: 'direction must be AR, AP, or AUTO' }`.
    - 400 extract empty files: `{ ok: false, error: 'No files received' }`.
    - 400 bank empty files: `{ ok: false, error: 'No file received' }` (note singular — preserve verbatim).
  - DB persistence for `failed` 400: `idempotent_requests` row has `status='failed'`, `response_status=400`, `response_body=JSON.stringify(payload)` exactly matching the returned body.
  - DB persistence for `completed` 200: unchanged; outside helper scope but must remain untouched.
  - Replay: `replayIdempotentResponse(...)` is called with the stored row; returns a `Response` with the stored body + status + `Content-Type: application/json` — unchanged.
  - Soft-rollout warn: `logger.child({ route: <routeKey> }).warn('Upload request missing idempotency key during soft rollout', <fields>)`. Route-specific fields:
    - `extract_upload` → `{ clientId, direction: rawDirection, fileCount: extractionInputs.length }`.
    - `bank_statement_upload` → `{ clientId, fileCount: uploadBuffers.length }`.
    - Log level (`warn`), message literal, and `route` child-logger binding must all survive.
  - Order of operations: admission check → validation → job creation (`createJob`) → job attach (`attachJobToIdempotentRequest`) → work → completion. Must not reorder. The helper must not invoke `createJob` or `attachJobToIdempotentRequest` — those stay in the route.

- **Non-observable:**
  - `beginIdempotentRequest` must be called exactly once per request that carries an idempotency key. No double-calls.
  - `completeIdempotentRequest(..., 'failed', 400, ...)` must fire before the 400 response is returned (existing code is sequential `await` — helper must preserve ordering; do not fire-and-forget).
  - No new DB queries introduced. The refactor is pure code-motion.

## Preservation Proof

Existing tests covering the target (`backend/src/routes/upload-idempotency.test.ts`):

| Invariant | Existing test | Coverage |
|---|---|---|
| Extract soft-rollout no-key success (invariant 7, partial) | `allows extraction uploads without an idempotency key during the soft rollout` | Asserts 200 + no row inserted; does NOT assert warn log fields. |
| Extract replay (invariant 5) | `replays extraction upload responses for the same key` | Full. Covers AC5. |
| Extract mismatch (invariant 1) | `rejects extraction key reuse for a different payload` | Asserts 409 + `code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH'` + `ok: false`; does NOT assert the exact `error` string. Acceptable — `toMatchObject` loose match protects against regressions in the other two fields. Acceptance AC1 passes on existing test. |
| Extract in-progress (invariant 3) | `returns 409 with the existing job id while extraction upload is in progress` | Full. Covers AC3. |
| Bank replay (invariant 5) | `replays bank upload responses for the same key` | Full. Covers AC6. |
| Bank soft-rollout no-key success (invariant 7, partial) | `allows bank uploads without an idempotency key during the soft rollout` | Same gap as extract — no warn-log assertion. |

Coverage gaps (regression tests MUST land in `backend/src/routes/upload-idempotency.test.ts` BEFORE the refactor modifies the routes):

1. **Bank mismatch** (invariant 2) — no test exists. **Test to add:** `rejects bank key reuse for a different payload` — POST bank upload with key K and fileset A, then POST with key K and fileset B; assert second response is 409 + exact mismatch body.
2. **Bank in-progress** (invariant 4) — no test exists. **Test to add:** `returns 409 with the existing job id while bank upload is in progress` — mirror of the extract in-progress test, using a `blocker` promise on the `ingestBankStatement` mock. Requires extending `applyRouteMocks()` to make `services/bank` mockable with a blocker.
3. **Failed-400 persistence + replay** (invariant 6) — no test exists. **Test to add:** `replays persisted 400 failures for the same key` — three sub-cases in one test or three tests, executor's choice:
   - Extract with invalid `direction=XXX` + key K → 400 `{ ok: false, error: 'direction must be AR, AP, or AUTO' }`; retry same key → same 400 body; assert `extractionState.calls === 0` (no re-processing).
   - Extract with empty `files` + key K → 400 `{ ok: false, error: 'No files received' }`; retry → replay.
   - Bank with empty `files` + key K → 400 `{ ok: false, error: 'No file received' }`; retry → replay.
4. **Warn-log fields** (invariant 7, full) — no test asserts log payload. **Test to add:** `emits soft-rollout warn with route-specific fields when key is missing` — stub `logger.child().warn` (spy), POST both routes without a key, assert `warn` called with message + expected field shape per route. Since tests already mock modules via `bun:test`'s `mock.module`, add a `logger.warn` spy via `mock.module('../lib/logger', ...)`.

**All four gap-filling tests must land and pass on the pre-refactor source (SHA 2edac08) before any route edit.** If any fails on the pre-refactor source, the test is wrong or an invariant was overstated — stop and escalate, do not proceed.

Verification: `cd app/backend && bun test src/routes/upload-idempotency.test.ts && bun test` — green pre-refactor (with the 4 new tests added) and green post-refactor.

## Structure Improvement

Before:      6 admission-ladder `if (idempotency.kind === ...)` branches + 3 failed-400 `if (idempotencyRequestId) { await completeIdempotentRequest(...) } return c.json(payload, 400)` blocks, copy-pasted across 2 route files.
After:       One `backend/src/lib/upload-idempotency.ts` owning the admission ladder + failed-400 completion. Each route has exactly one admission call site and one failed-400 call site per 400 payload (currently 2 in extract, 1 in bank). The warn-log stays at the call site (per Rabbit-Hole note).
Axis:        Coupling (duplicated policy collapsed into one owner) and correctness-risk (drift between the two routes' error shapes becomes structurally impossible rather than convention-enforced).
Measurable:
- Admission-ladder branch sites in route files: 6 → 0 (2 thin call sites instead).
- Failed-400 completion blocks in route files: 3 → 3 one-line call sites (logic centralised in 1 helper).
- New file: 1.
- Net file count delta: +1 source file, test file unchanged-in-count but gains 4 new tests.
- Observable HTTP behavior diff via the full `upload-idempotency.test.ts` suite: 0.
