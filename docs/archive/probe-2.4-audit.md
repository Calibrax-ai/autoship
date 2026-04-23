# Probe-2.8 Quality Audit

**Auditor:** Claude Opus 4.7 (1M context) · **Date:** 2026-04-17
**Probe path:** `/Users/shyangcalibrax/Documents/Projects/autoship-probe-2.4/`
**Commits audited:** scaffold `44ae54d` → final `f19863c` (14 slice commits + scaffold + oracle + retroactive walk fix `777613c`)

## Top-line verdict

**Pass-with-issues.** Probe-2.8 is the first probe that actually delivers a cohesive, visually-correct, functionally-alive app — every sidebar route renders seeded data, no dialog-theater was found anywhere, and the S13 human-override produced a **real** upload-scan (verified via curl: 200 response, +1 row in `crinacle_transactions`, +1 row in `crinacle_inbox_messages`, correct envelope `{ok, transaction_id, series_id, status}`). The controller did not silently ship a stub.

Three classes of issues temper the grade: **(1)** one real screenshot-contract failure (The Stage is missing its orchestration arrows — only the card grid survived), **(2)** a journey-walk test-isolation bug where J03's `Post-to-GL` pollutes `crinacle_gl_journal` and breaks J05's "empty" assertion when the walks run in ASCII-numeric order (J05 passes in isolation, fails after J03), and **(3)** 20 oracle tests still fail, all from out-of-scope endpoint families (customers, fx-rates, doc-revisions, transactions CRUD, file-serving) that no slice ever claimed — but the controller reported these as "the final state" without enumerating that they are decisioned-out, not regressions. The biggest surprise: S13 — the slice most likely to be sabotaged — is the cleanest code in the build.

## Ground-truth baseline (captured fresh)

| Check | Result |
| --- | --- |
| Postgres `autoship-pg` up + migration applied | Yes |
| `npm run seed` from empty DB | `entities=1 transactions=43 bank_txns=13 bank_matches=5` |
| Oracle pass/fail on running server | **133 / 20 / 0** of 153 (matches `progress.txt` self-report exactly) |
| Dialog-theater grep (`preventDefault…closeDialog`) across whole `app/` | **0 matches** |
| Console errors on every page visited (7 routes) | **0 errors**, 2 warnings/page (Vite HMR noise) |
| Playwright walks J01–J14 run together | **13/14 pass** — J05 fails when J03 ran before it in the same invocation; passes in isolation |
| Playwright walks run per-file in isolation | **14/14 pass** |

### The 20 failing oracle tests (decisioned-away, not regressions)

All failures are on endpoint families that were **never assigned to a slice** and are still 501-stubs:

- **`customers.test.ts`** (4) — `GET /customers`, PII strip, `DELETE /customers/<id>`, `/customers/export`
- **`fx-rates.test.ts`** (4) — `GET /fx-rates`, `DELETE /fx-rates/<id>`, `/fx-rates/export`, `/fx-rates/lookup`
- **`doc-revisions.test.ts`** (3) — `/doc-revisions`, `/conflicts/<id>` GET + resolve
- **`files.test.ts`** (2) — `/files/<path>` 404 and PDF-serving
- **`fx-rates` + `customers` CSV export** (in `csv-export.test.ts`, 2)
- **`transactions.test.ts`** (5) — `/transactions/<id>/edit`, `/delete`, `/status`, `/resolve-review`

These appear in `decisions.md` under "Oracle exclusions" as in-scope endpoints but **no slice in the 14-row plan targets them** (customers/fx-rates/files/transactions CRUD/doc-revisions are not in any journey). The controller accepted the arithmetic (+2 / –2 for the last two slices ending at 133/20) without calling out that 20 is a structural floor, not a noisy tail.

---

## 1. Slice-by-slice delivery audit

Every slice = one journey shipped end-to-end. All commits verified via `git show`; visual spot-checks done against `artifacts/screenshots/NN-*.png` and the app running with seeded data.

| # | Commit | Journey | Files touched | Oracle Δ | Journey walk (isolated) | Visual drift | Verdict |
|---|---|---|---|---|---|---|---|
| **S01** | `3012c12` | **J12** — Switch Client | 10 files, +596 | 42→77 (+35) | Pass | None; client switcher dropdown matches 01-dashboard.png top-bar | **Strong Pass** |
| **S02** | `31efc9b` | **J08** — Business Context | 6 files, +332 | 77→79 (+2) | Pass | Minor — seeded state correctly flips AR/AP/GL to CONFIGURED (journey text assumed empty probe, built app honors the seeded-truth invariant per program.md) | **Pass** |
| **S03** | `48319ce` | **J02** — AR ledger | 15 files, +1252 | 79→95 (+16) | Pass | None; waterfall + 4 cards + filter bar + table + warning banner structurally identical to 02-accounts-receivable.png | **Strong Pass** |
| **S04** | `e4c7e55` | **J03** — AP ledger + post-to-gl | 6 files, +779 | 95→104 (+9) | Pass | None; Category column present as journey specified | **Strong Pass** |
| **S05** | `88f107f` | **J04** — Bank Reconciliation | 7 files, +956 | 104→115 (+11) | Pass | Minor — 2×4 card grid correct; Matched=0 honest (seed has 5 bank_matches but `confirmed=false`, so all in Pending not Matched) | **Pass** |
| **S06** | `51b80b9` | **J05** — General Ledger | 6 files, +549 | 115→122 (+7) | Pass (isolated); **Fails** after J03 in suite | Native `<select>` vs styled dropdown — minor; empty-state matches screenshot | **Pass-with-issues** (see "cross-cutting" for the isolation bug) |
| **S07** | `11a0bfa` | **J01** — Dashboard / Reviews | 7 files, +376 | 122→124 (+2) | Pass | None; matches 01-dashboard.png | **Strong Pass** |
| **S08** | `4d61a9f` | **J06** — Analytics | 11 files, +1290 | 124→124 (+0, client-only per A6) | Pass | **Moderate drift**: Top Customers bar chart has overlapping X-axis labels (seeded Malaysian company names too long for auto-sizing); P&L Summary + Cost Breakdown render fine. Journey text's "Q1 / Q4 '25 / All" period pills are present. No `/analytics` endpoint added (A6 honored) | **Pass-with-issues** |
| **S09** | `65b3bfe` | **J07** — Activity / Inbox | 6 files, +430 | 124→128 (+4) | Pass | None; split-panel empty-state as specified (07-activity.png) | **Strong Pass** |
| **S10** | `1a29066` | **J09** — Workflow Design | 4 files, +208 | 128→128 (+0, A1 client-only) | Pass | None; 5 workflow cards list with Edit buttons matches 09-workflow-design.png | **Pass** |
| **S11** | `48a9881` | **J10** — The Stage | 6 files, +507 | 128→129 (+1) | Pass | **Real drift**: the orchestration *diagram* is reduced to a card grid. Reference screenshot 10-the-stage.png shows curved arrows connecting AP+AR → Reconciler → GJA+Analytics; built app renders only the cards with no connecting arrows. Per program.md "missing diagrams/arrows" is explicitly called out as "major drift". | **Pass-with-issues** |
| **S12** | `434de65` | **J11** — Minion Library | 4 files, +428 | 129→129 (+0, A1 client-only) | Pass | None; 14 minions across 4 categories with skill chips matches 11-minion-library.png. (Journey JSON prose says "13 minions" but its own `observe` steps enumerate 14 distinct names — spec-prose inconsistency, not a build bug.) | **Strong Pass** |
| **S13** | `8083238` | **J13** — Upload Documents (HUMAN OVERRIDE) | 7 files, +323/−61 | 129→131 (+2) | Pass | N/A (no reference PNG); real dialog + real upload — see S13 deep dive | **Strong Pass** |
| **S14** | `f19863c` | **J14** — Reset Data | 8 files, +224 | 131→133 (+2) | Pass | None; red-styled sidebar footer button + confirm dialog + page reload matches the footer visible in 01-dashboard.png | **Strong Pass** |
| `777613c` | Retroactive | J02/J03 walk fixup post-S13 | 2 files, +12/−6 | (no Δ) | Pass | Honest — replaces stale `"Implemented in S13."` text assertions with real dialog-surface testids; doesn't exercise the upload itself (J13.spec.ts covers that end-to-end) | **Pass** |

**Dialog-theater grep:** `0 matches` across all of `app/`. The anti-pattern the controller was warned about never shipped.

**Journey walk file inventory:** `app/journeys/J01.spec.ts` … `J14.spec.ts` — all 14 present, all real Playwright tests.

---

## 2. S13 deep dive — the linchpin

S13 was reinstated via human override at 2026-04-17 11:45 after the controller had initially cut J13 with the "blocked-other in probe; no observed contract" rationale — the exact failure mode learnings.md warns against ("probe limitations ≠ spec ambiguity"). The revised A7 contract in `decisions.md` specifies: real multipart POST, real PDF, INSERT into `crinacle_transactions` + `crinacle_inbox_messages`, envelope `{ok, transaction_id, series_id, status}`.

### Evidence (curl probe against the running server)

```
BEFORE:  crinacle_transactions count = 43, crinacle_inbox_messages count = 0

$ curl -s -X POST \
    -F "file=@artifacts/sample-data/pdfs/ar/AR-001_INV_INV_2026_001.pdf" \
    -F "direction=AR" -F "entity=PROBE" \
    http://localhost:3001/api/v1/upload-scan

{"ok":true,
 "transaction_id":"TXN-59f9a8e0-7f23-42e3-bf04-c29ee28db301",
 "series_id":"AR-001",
 "status":"PENDING_MATCH"}

AFTER:   crinacle_transactions count = 44, crinacle_inbox_messages count = 1
```

Inspection of the new rows:

- `crinacle_transactions`: `series_id=AR-001, direction=AR, status=PENDING_MATCH, counterparty='Restoran Maju Jaya'` (correctly looked up from a prior AR-001 row), `document_type=INVOICE` (correctly mapped from `INV`), `document_number='INV/2026/001'` (slashes correctly restored from underscores). Amounts (`subtotal_amount, tax_amount, total_amount`) are NULL — honest, per A7: "No PDF parsing needed — filename is the metadata source."
- `crinacle_inbox_messages`: `type='SCAN', subject='INVOICE uploaded for AR-001', body='Document INV/2026/001 (AR-001_INV_INV_2026_001.pdf) was uploaded.'` — matches A7 literally.

### Handler inspection (`app/server/src/routes/upload-scan.ts`, 99 LOC)

Real `parseBody()` with a `DOC_TYPE_MAP` covering INV/DO/GRN/RCP/CN (derived from the filename convention in `transactions.csv`), direction-aware status (AR→PENDING_MATCH, AP→PENDING_REVIEW, per C2), counterparty lookup from prior rows of the same series, and a fresh `TXN-<uuid>` identifier for the new row. Zero mocking, zero placeholder toasts, zero `closeDialog()` without a side effect.

### UI wiring (AR/AP pages)

The shared `UploadDocumentsDialog` component is a real file-input dialog with a `<form>` that does `fetch("/api/v1/upload-scan", { method:"POST", body: formData })`, awaits the response, closes on success, and refetches the AR/AP list so the new row appears. The J13 Playwright spec (`app/journeys/J13.spec.ts`, 70 LOC) verifies this end-to-end: it uploads a real PDF, asserts `response.status===200`, asserts the parsed body shape, and asserts `rows.count()` increases past the pre-upload baseline.

### Follow-up commit `777613c` ("chore(walks): update J02/J03 post-S13")

Replaces stale `"Implemented in S13."` placeholder-text assertions in `J02.spec.ts` and `J03.spec.ts` with real dialog-surface testids (`upload-documents-file`, `upload-documents-submit`). **These two specs still do not exercise the upload itself** — they only open the dialog and close it. But J13.spec.ts does the real walk with a real PDF, so coverage is not duplicated and nothing is stubbed away. The commit message is honest about what it's doing.

### Verdict

**The human-override format worked exactly as intended.** S13 is the cleanest-authored slice in the build: small (99-line route + a shared React component), verifiable (curl + DB + Playwright walk all agree), honest about scope (NULL amounts because the filename doesn't carry them). The override pattern — "reject the cut in `decisions.md` with a pointer to the specific spec-pack evidence, add a revised A-entry, restart the slice loop" — is replicable. This is the strongest empirical argument so far that the generator-evaluator split described in `docs/harness-philosophy.md` matters: an adversarial reviewer catching "blocked-other → cut" and forcing a redo is precisely where value lands.

---

## 3. Cross-cutting quality

### Oracle baseline on seeded DB

`133 / 20 / 0` of 153 (matches self-report, verified by running `npx vitest run` against a fresh migrate+seed against the running server). See the baseline section above for the 20 decisioned-away failures.

### Dialog-theater

Zero across `app/`. The anti-pattern was raised in `progress.txt` conventions multiple times (S03, S04, S06) and all pages that have any "coming later" affordances use the **honest-disabled** pattern (`disabled + title="… coming later"`) — verified visually on the AR page Source filter and Hide Shopify checkbox, and on the GL Compare button.

### Console errors

Zero on every page navigated (`/`, `/accounts-receivable`, `/accounts-payable`, `/bank-reconciliation`, `/general-ledger`, `/analytics`, `/the-stage`, `/business-context`, `/activity`, `/workflow-design`, `/minion-library`). Two warnings per page, all Vite HMR dev-mode noise.

### Known drift from reference screenshots

| Page | Reference | Built | Severity |
| --- | --- | --- | --- |
| The Stage (`10-the-stage.png`) | Curved arrows connect AP+AR → Reconciler → GJA + Analytics | Cards rendered in a static grid with no connecting arrows | **Real drift** — program.md explicitly names "missing diagrams/arrows" as "major drift" |
| Analytics Top Customers chart | Rotated / truncated customer labels | Overlapping X-axis labels on seeded Malaysian company names | Minor — recharts auto-sizing failure, same shape, just unreadable |
| Business Context pipeline | All 7 sources show SETUP on empty probe | AR/AP/GL flip to CONFIGURED on seeded PROBE | Not drift — correct behavior on seeded state (program.md prefers seeded over empty-state assertions) |
| The Stage footer counter | "0 AR + 0 AP records extracted for PROBE" | Same text, using `stage_logs` array length (always 0) instead of transaction count | Minor — the counter never reflects seeded 37 AR + 6 AP transactions |
| Business Context / elsewhere: double-header | n/a | The `Calibrax Grid` brand + client switcher appear **twice** — once in the left sidebar header, once in the topbar center — not in any reference screenshot | Minor visual — every reference PNG shows the client switcher only in the top-right; building it twice duplicates it |

### Schema consistency

- All tables defined in one Drizzle schema file and used consistently. No orphan columns found on the key tables.
- `crinacle_bank_matches`: I attempted `SELECT bank_txn_id` and got "column does not exist" — the match table uses `bank_stmt_id` instead (joining to `crinacle_bank_txns` via `bank_stmt_id` → `id`). This is internally consistent, but the A7 region and the sample-data `bank_statement.csv` column name (`linked_txn_ids`) suggest a transaction→match mapping that is actually persisted as `stmt→match`. Oracle's `bank-match-integrity.test.ts` passes, so the seed script and handler agree. Worth double-checking in probe-2.5 whether the simpler `bank_txn_id` schema would reduce confusion.
- No late-slice schema changes that should have been migrations — S07's schema note ("new tables go at the END of schema.ts via additive append") was honored by all later slices.

### Seed script from empty DB

`npm run seed` runs cleanly from an empty DB and produces the expected counts (`entities=1 transactions=43 bank_txns=13 bank_matches=5`). The S14-set "dual-role pattern" (module export + CLI entrypoint with `pool.end()` only in `main()`) is in place and S14's `/reset-all` handler imports the same `seedAll()` function.

### Broken state for later slices

- **S05 → S06 GL pollution (real):** `J03.spec.ts` (S04 walk) clicks Post-to-GL, which INSERTs into `crinacle_gl_journal`. `J05.spec.ts` (S06 walk) asserts `gl-empty-state` is visible. When Playwright runs all specs in its default parallel/sequential mode, J03 often runs before J05 and breaks it. No slice resets DB state between walks. This is the **only** real cross-slice breakage found.
- No other slice-state pollution: S13's upload-scan adds a row, but no later journey asserts an exact row count.

---

## 4. Gaps + recommendations

### What the product is missing to be production-candidate

- **Auth / user management / multi-tenancy isolation.** Decisioned-away via G1 ("no authentication"). Entity tenancy is a query param with no enforcement. PROBE's data is visible to anyone who can reach the port.
- **Error states beyond happy path.** The app renders well for seeded-success; there's no visible 500-handling surface if the backend throws. No retry affordance, no toast on failed fetch.
- **Pagination.** AR renders 37 rows in a single page, bank shows 13, but at 10k rows the client-side aggregation (S08 analytics) would become unusable.
- **Accessibility.** Not audited; seeded-data pages visually use color-only status indicators.
- **Operational concerns.** No migration history (drizzle-kit push --force is used as the migration runner), no backups, no env-var management beyond `DATABASE_URL`. The seed script truncates and reseeds on every run — destructive by default.
- **Real PDF parsing on upload-scan.** A7 revised was honest that amounts stay NULL ("filename is the metadata source"); a production flow would parse the PDF content for counterparty + amounts + dates.

### What the controller got wrong (patterns a reviewer should catch next time)

1. **The J13 "blocked-other" cut.** This is the probe-2.5 motivating example. Without human intervention the controller would have shipped a 13-slice build with J13 as a polite 501 / dialog with a toast. The stated reason was "probe-observation limitation" — learnings.md already documents this as a failure mode, but the controller re-invented it anyway. A fresh-context reviewer with explicit access to `decisions.md` + `sample-data/` would catch this class of cut mechanically: "does the controller's cut reason name an artifact that exists in the spec pack?"
2. **The Stage missing arrows.** The screenshot contract says "missing diagrams/arrows" is major drift; the controller shipped S11 anyway. Likely self-graded because the cards were present and the journey walk asserts cards, not arrows. This is the kind of thing only an adversarial reviewer looking at the PNG would flag — the *executor's own* journey walk has no way to detect "this looks like a grid, not a diagram."
3. **Test-isolation oversight across walk files.** Every slice's own walk assumed fresh-seeded state; none coordinated with the shared GL table. The retroactive `777613c` commit fixed stale placeholder text in J02/J03 — a similar retroactive fix for J03's GL-pollution in J05 did not happen. The controller did not run `npx playwright test` (no filter) at the end of the build to catch this.
4. **Accepting 20 failing oracle tests as "steady state" without enumerating they're structural floor.** Progress.txt's per-slice "+N / −M" arithmetic is honest; the end-state summary simply says "133 / 20 / 0" without flagging that 20 = (4 customers + 4 fx-rates + 3 doc-revisions + 2 files + 2 csv-export + 5 transactions) all from endpoints that no slice targets. A reviewer should force "which specific failing tests are OK to leave red, and why?" into decisions.md.
5. **Double-rendered brand / client switcher.** Appears on every page; the scaffold put it in both sidebar and topbar and no later slice caught it. Pure self-grading blind spot: if the executor never looks at a reference PNG side-by-side with the built page, the duplicate never flags.

### What probe-2.5 should specifically test

The `plan-reviewer` agent (new in 2.9) addresses several of these:

- **Covers #1 (J13-style cuts):** Yes — a fresh-context skeptic with `decisions.md` + `sample-data/` + `program.md` access should mechanically flag "cut reason points at a probe limitation, not a spec gap."
- **Covers #4 (endpoint-coverage accounting):** Partially — depends on whether the calibration set explicitly encodes "enumerate failing tests' root cause, not just count."
- **Does NOT cover #2 (screenshot drift):** The plan-reviewer runs between slice-plan and Stage 1 oracle — it sees the slice intent, not the built UI. A separate post-slice visual reviewer would be needed to catch "The Stage has no arrows."
- **Does NOT cover #3 (walk isolation):** The plan-reviewer evaluates plans, not retroactive test interactions. A full `npx playwright test` at the end of the build, gated on exit 0, would be a mechanical fix.

**Recommended orthogonal 2.9 additions:**

1. **End-of-build "all walks together" gate** — `npx playwright test --reporter=list` with no `--filter`; exit 0 required before declaring build done. Catches cross-spec pollution mechanically.
2. **Per-slice visual-diff logging** — the controller already does an "eyeball comparison" per program.md. Save both built + reference screenshots under `logs/visual/sNN/` and include a one-line drift note in the slice commit body. The plan-reviewer (or a post-hoc visual reviewer) can then cross-check the note against the images.
3. **Oracle-failure provenance in `decisions.md`** — every red test at end-of-build must cite an A-entry or a cut rationale. A grep check: `grep -L "A[0-9]" <failing-test-file>` → if 0 references, add a decision or fix the test.

### Recommended follow-up work (outside 2.9 scope)

- Replace the per-walk seed assumption with a test-scoped fixture helper (fresh schema per walk, not per run).
- Fix The Stage orchestration diagram — either add SVG arrows or route it through a lightweight diagram lib (reactflow) per workflow dependencies.
- Strip duplicate brand/client switcher from Topbar or Sidebar (keep one).
- Audit the 20 failing tests: decide per-endpoint whether to implement or to formally declare in `decisions.md` (currently they sit in "oracle exclusions" section, but as in-scope endpoints with no slice assigned). This is spec debt that will mask real regressions in future probes.

---

## Appendices

### Evidence citations

- Oracle run log: `/tmp/probe24-oracle.log` (133 pass / 20 fail, verified 2026-04-17)
- Upload-scan curl probe: inline in §2, DB before/after captured via `docker exec autoship-pg psql`
- Visual screenshots captured during audit: `/Users/shyangcalibrax/Documents/Projects/autoship/docs/audit-screenshots/probe24-*.png`
- Slice commit SHAs: `3012c12 31efc9b 48319ce e4c7e55 88f107f 51b80b9 11a0bfa 4d61a9f 65b3bfe 1a29066 48a9881 434de65 8083238 f19863c` plus retroactive `777613c`
- Walk isolation repro: `npx playwright test journeys/J05.spec.ts` → PASS in isolation; `npx playwright test journeys/J03.spec.ts journeys/J05.spec.ts --workers=1` → J05 FAIL on `gl-empty-state not visible`

### Reference screenshots vs built (visual spot-checks)

- `01-dashboard.png` vs `audit-screenshots/probe24-01-dashboard.png` — match (structural)
- `02-accounts-receivable.png` vs `probe24-02-ar.png` — match, seeded 37 rows render correctly
- `03-accounts-payable.png` vs `probe24-03-ap.png` — match, 6 AP rows
- `04-bank-reconciliation.png` vs `probe24-04-bank.png` — match, 13 bank txns, 2×4 card grid, invariant 0+4+9=13 holds
- `05-general-ledger.png` vs `probe24-05-gl.png` — match on empty state
- `06-analytics.png` vs `probe24-06-analytics.png` — match on layout; Top Customers label overlap is new drift
- `08-business-context.png` vs `probe24-08-business.png` — match on pipeline layout; SETUP/CONFIGURED divergence is correct seeded behavior
- `09-workflow-design.png` vs `probe24-09-workflow.png` — match, 5 cards with Edit
- `10-the-stage.png` vs `probe24-10-stage.png` — **DRIFT: orchestration arrows missing**
- `11-minion-library.png` vs `probe24-11-minion.png` — match, 14 minions × 4 categories with skill chips (confirmed by grep on `MinionLibrary.tsx`: 14 `name:` entries)
