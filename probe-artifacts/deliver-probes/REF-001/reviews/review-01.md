---
issue: REF-001
review-of: brief.md
reviewed-at: 2026-04-22T00:00:00Z
reviewer-sha: 2edac08
verdict: APPROVED
---

# Brief Review 01 — 2026-04-22

## VERDICT: APPROVED

## Check 1 — Well-formedness: PASS
Frontmatter carries all required keys including the Refactor-specific `preservation-status: needs-coverage-first`. All seven base sections exist and are populated: Outcome (≤15 words, one-line structural goal), Acceptance Criteria (AC1–AC10), Scope Fence (Always/Ask-first/Never-touch), Rabbit-Hole Patches (7 decisions pre-made, none punted), Blast-Radius Manifest (all four buckets: Expected to create / change / May change / Must not change), Skeleton Position, Concrete Example. The Refactor-required `Behavior Preservation` section carries all three mandated subsections — "What must be preserved" (Observable + Non-observable bullets), "Preservation Proof" (existing-test table + Coverage gaps list + Verification command), and "Structure Improvement" (Before + After + Axis + Measurable). No section is empty or TBD.

## Check 2 — Groundedness: PASS
Every cited `file:line` verifies against the testbed at SHA 2edac08. `extraction.ts` lines 1193–1251 match the snippet quoted in the Concrete Example verbatim (the `if (idempotency.kind === 'mismatch'|'processing'|'replay')` ladder at 1202/1213/1225 and both failed-400 blocks at 1238–1243 and 1246–1251). `reconciliation.ts` lines 370–419 match the mirror-image ladder at 379/390/402 and the failed-400 at 414–419. `backend/src/lib/upload-idempotency.ts` is confirmed absent (Read errored), validating the "Expected to create" claim. The four existing tests named in the Preservation Proof table (`allows extraction uploads without…`, `replays extraction upload responses…`, `rejects extraction key reuse…`, `returns 409 with the existing job id…`, plus bank variants) all exist in `upload-idempotency.test.ts` and exercise the refactor target. Coverage gaps are named with specific test titles + specific behaviors + specific payloads + specific assertions (extractionState.calls === 0, `logger.warn` spy fields). Verification commands are runnable with specific `-t` test-name filters rather than "run the suite."

## Check 3 — Scope sanity: PASS
The load-bearing no-observable-behavior-change rule holds — "What must be preserved → Observable" enumerates exact status codes, verbatim response bodies (including the extract vs bank singular/plural quirk `'No files received'` vs `'No file received'`), DB persistence contract, replay shape, warn-log message + fields + level + `route` child binding, and order of operations. Structure Improvement gives a concrete, measurable target (6 ladder branches → 0 in routes + 2 thin call sites; 3 failed-400 blocks → 1 helper + 3 one-line call sites; +1 source file). No while-we're-here additions — Rabbit-Hole Patches explicitly defer the success-completion extraction, the 500-path extraction, and moving `handleUploadBankStatement` out of `reconciliation.ts`, each with a cost/fit reason rather than punting. Never-touch list is file-specific (`idempotency.ts`, `idempotency.test.ts`, DB schema, `services/*`, `middleware/*`, other routes, frontend, `package.json`). Coverage-gap plan is specific down to test titles and sub-cases. Single-slice classification is correct: one helper, two call sites, no cross-cutting indicators.

## Notes (non-blocking observations)
- AC9's `git diff --name-only 2edac08...HEAD -- app/backend/` verification is fine but the executor should be aware the regression tests in `upload-idempotency.test.ts` land in the same file under "Expected to change" — Scope Fence and Blast-Radius both list that file, so no conflict.
- Rabbit-Hole point 7 (warn-emission ownership) explicitly prefers option (b) "warn stays at call site" but permits (a) if cleaner. The brief's Observable invariants already constrain log shape either way, so either path preserves behavior. Fine as-is.
- The Mismatch existing-test column notes the test uses `toMatchObject` (loose) rather than asserting the exact `error` string. AC1 requires the *exact* error-string body. If the pre-groomer wants belt-and-braces, they could tighten that single assertion as part of the coverage-gap pass, but it isn't blocking — the brief already covers failed-400 persistence (the more valuable gap) and AC1 still passes against current code.
