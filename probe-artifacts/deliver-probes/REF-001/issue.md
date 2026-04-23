# REF-001 — Consolidate upload idempotency admission flow

**Source:** operator-authored (autoship-deliver-0.3 probe; no Linear equivalent — Gridfin's Linear project does not track Refactor-shaped work).
**Type:** Refactor (behavior-preserving structural change).
**Priority:** n/a (probe-driven).

## Problem

Two upload routes — `backend/src/routes/extraction.ts` (`POST /extract/upload`) and `backend/src/routes/reconciliation.ts` (`POST /reconciliation/upload` bank-statement handler) — contain the same idempotency admission flow, copy-pasted.

At pinned SHA `2edac08`:

**Ladder duplication (6 sites, 2 files):**

- `extraction.ts:1202` — `if (idempotency.kind === 'mismatch')` → 409 `IDEMPOTENCY_KEY_REUSE_MISMATCH`
- `extraction.ts:1213` — `if (idempotency.kind === 'processing')` → 409 `IDEMPOTENCY_REQUEST_IN_PROGRESS`
- `extraction.ts:1225` — `if (idempotency.kind === 'replay')` → `replayIdempotentResponse(...)`
- `reconciliation.ts:379` — identical mismatch branch
- `reconciliation.ts:390` — identical processing branch
- `reconciliation.ts:402` — identical replay branch

**Failed-400 completion duplication (3 sites):**

The pattern `if (idempotencyRequestId) { await completeIdempotentRequest(idempotencyRequestId, 'failed', 400, JSON.stringify(payload)) } return c.json(payload, 400)` appears at:

- `extraction.ts:1238–1243` — invalid `direction` payload
- `extraction.ts:1246–1251` — empty `fileList` payload
- `reconciliation.ts:414–419` — empty `validFiles` payload

## Why this is worth refactoring

- **Correctness risk from drift.** The two ladders and three failed-completion sites must stay in lockstep. If one route's error shape or status code diverges from the other, idempotent replay becomes inconsistent across routes.
- **Real duplication, not coincidental similarity.** All six admission branches share identical response shapes and status codes. All three failed-completion sites share the same persistence pattern with only the error payload varying.
- **Seam is already implied.** The primitive helpers (`beginIdempotentRequest`, `completeIdempotentRequest`, `replayIdempotentResponse`, `attachJobToIdempotentRequest`) live in `backend/src/lib/idempotency.ts`. The missing layer is the route-level *admission flow* that composes those primitives into the mismatch/processing/replay ladder.

## Structural goal

Extract the admission ladder and the failed-400 completion pattern into a shared helper module so each upload route expresses only what is route-specific (route key, log fields, payload text).

The pre-groomer owns the concrete shape. This issue does not prescribe a specific function signature.

## What must NOT change

- Exact HTTP status codes (409 for mismatch/processing, whatever each caller returned for failure).
- Exact response bodies: `ok: false`, `error: <text>`, `code: <code>`, `jobId: <id>` where present.
- Exact field names and casing in response JSON.
- The idempotency persistence model: for a `failed` terminal state, the stored response body remains `JSON.stringify(payload)` with the same status.
- Route-specific log messages and fields for the missing-key soft-rollout warn path (the warn call itself may move, but the emitted log payload shape must not change).
- Order of operations: admission check → validation → job creation → attach → work → complete. Do not reorder.

## Scope fence

- **Touch:** `backend/src/routes/extraction.ts`, `backend/src/routes/reconciliation.ts`, and one new helper file under `backend/src/lib/`.
- **Do not touch:** `backend/src/lib/idempotency.ts` (primitive helpers are already factored; this refactor is one layer above them). The DB schema, migrations, Clerk middleware, extraction pipeline, reconciliation matcher service, frontend, other routes, or any other lib file.
- **No migrations.** No schema changes. No new deps.

## Preservation — observable invariants

These behaviors must remain identical pre- and post-refactor, verifiable via HTTP tests:

1. `POST /extract/upload` with a reused idempotency key and different request fingerprint returns 409 `{ ok: false, error: 'Idempotency key has already been used for a different upload', code: 'IDEMPOTENCY_KEY_REUSE_MISMATCH' }`.
2. Same contract for `POST /reconciliation/upload` (bank-statement) with reused key + different fingerprint.
3. `POST /extract/upload` while an earlier request with the same key is still in-progress returns 409 `{ ok: false, error: 'This upload is already being processed', code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS', jobId: <originalJobId> }`.
4. Same contract for `POST /reconciliation/upload` in-progress replay.
5. Replay of a completed idempotent request returns the originally-persisted response (body + status).
6. A `failed` terminal state caused by validation 400s is persisted under the idempotency key, so a subsequent retry with the same key replays the same 400 rather than re-processing.
7. Missing idempotency key (soft rollout) still succeeds and emits a `warn` log with the existing route-specific fields.

## Existing coverage

- `backend/src/routes/upload-idempotency.test.ts` — route-level idempotency behavior for extraction + bank uploads (soft rollout, replay, mismatch, in-progress, no-key success). Not all invariants above are explicitly covered — see the preservation proof the pre-groomer will produce.
- `backend/src/lib/idempotency.test.ts` — primitive-helper level. Not directly affected by this refactor, but confirms the primitives' contracts are stable.

## Measurable axis

- 6 admission-ladder branch sites → 2 helper-module branch sites + 2 route call sites (one per route).
- 3 failed-400 completion sites → 1 helper + 3 call sites (or folded into a single helper per failed-400 with a payload arg).
- Net: source duplication reduced by ≥50% on the admission flow; no behavioral diff detectable via HTTP tests.

## What good looks like at the end

- New file in `backend/src/lib/` owning the admission flow + failed-400 completion pattern.
- `extraction.ts` and `reconciliation.ts` each have the 3-branch ladder replaced with a single call to the new helper; the 400 handlers call the new failed-completion helper with their payloads.
- All existing tests in `upload-idempotency.test.ts` and the new coverage-gap tests (preservation proof) stay green pre- and post-refactor.
- No diff outside the three files.
- No observable behavior change.
