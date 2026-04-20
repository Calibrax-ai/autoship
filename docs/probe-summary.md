# Autoship Probe Summary — cost and wall-clock

This table summarizes the Claude API cost and wall-clock time per probe across the autoship research program (probes 0 through 2.5, run 2026-04-10 through 2026-04-20). Probes 2.5→2.9 were renumbered to 2.1→2.5 on 2026-04-18; this doc uses the new numbering throughout (old numbers retained inside parenthetical asides where the mapping matters).

*Disclaimers:* wall-clock is the elapsed real time covered by each session, summed across sessions — it includes idle time between turns within a session but excludes idle gaps between sessions. Active compute time is lower. Costs are estimated at **Opus 4 standard rates** ($15 / $75 / $18.75 / $1.50 per 1M input / output / cache-creation / cache-read tokens) and a tiny handful of Sonnet 4 sub-agent calls at Sonnet rates; these estimates may differ from invoiced amounts due to pricing-tier variations and batch discounts.

## Main table

| Probe | What was tested | Wall-clock | Sessions | Input | Output | Cache read | Est. cost |
|---|---|---|---|---|---|---|---|
| 0 | Manual end-to-end ingest | — | 0 | — | — | — | — |
| 1 | Automated ingest (`autoship.sh` + `--agent`) | 1h 24m | 20 | 353K | 1.7M | 127M | $517.44 |
| 1.5 | Controller agent (Track 2) | 59m | 7 | 77K | 1.0M | 52M | $246.80 |
| 2 | Ralph-loop build (oracle + app from spec) | 55m | 2 | 0.5K | 202K | 57M | $114.49 |
| 2.1 (ex-2.5) | Build-controller + stronger oracle + vertical slices | 5h 16m | 16 | 35K | 1.7M | 343M | $682.61 |
| 2.2 (ex-2.6) | Playwright journey tests added to oracle | 2h 5m | 12 | 96K | 1.1M | 132M | $263.32 |
| 2.3 (ex-2.7) | Journey-based slicing + atomic-task verification | 1h 58m | 20 | 2K | 955K | 109M | $347.68 |
| 2.4 (ex-2.8) | Sample-data seeding + screenshot-as-contract + 5 forcing-function gates | 4h 16m | 23 | 69K | 1.7M | 183M | $566.47 |
| 2.5 (ex-2.9) | Generator-evaluator: `plan-reviewer` caught 4 failures over 2 cycles; 14/14 journeys + 145/145 oracle pass | 4h 27m | 21 | 3K | 1.6M | 227M | $615.65 |
| Orchestration / docs (all probes) | Architecture doc, HTML proposal, learnings, harness-philosophy, CLAUDE.md, agent defs, this report | 159h 28m ⚠ | 7 | 69K | 3.9M | 836M | $1831.70 |
| **Totals** | | **180h 47m** | **128** | **705K** | **13.8M** | **2.07B** | **$5,186.15** |

⚠ The orchestration bucket is dominated by one long-lived interactive session (`80117ab9…`) opened 2026-04-10 and closed 2026-04-17 — its wall-clock reads 159h end-to-end but most of that is idle background time with the session suspended. Active compute time for that session is a small fraction of the span; the cost figure ($1.8K) is the honest signal. Probe-2.5's controller session has the same shape at smaller scale — its calendar span is ~49h (opened 04-18 02:24, closed 04-20 03:05) but active compute sums to 4h 27m; the probe row reports the active figure.

## Wall-clock per probe (for presentations)

| Probe | Wall-clock | Headline |
|---|---|---|
| 0 | — | Manual baseline — no Claude sessions |
| 1 | 1h 24m | First automated ingest — 4-probe fan-out works |
| 1.5 | 59m | Controller-as-agent (Track 2) equals bash orchestrator |
| 2 | 55m | Ralph-loop oneshot build ships 4.5K-line app |
| 2.1 | 5h 16m | First slice-executor build — stronger oracle |
| 2.2 | 2h 5m | Playwright journey tests replace unit-only oracle |
| 2.3 | 1h 58m | Journey-based slicing + atomic-task verification |
| 2.4 | 4h 16m | Sample-data + screenshot contract + 5 forcing-function gates |
| 2.5 | 4h 27m | Plan-reviewer catches 4 failures; 14/14 + 145/145 green |

## Per-probe breakdown

**Probe 0 (manual, 2026-04-10 → ~04-14).** No Claude-orchestrated sessions — this probe ran through manual prompts and hand-stitched artifacts before `autoship.sh` existed. Zero cost in this analysis. Its "compute" cost is buried inside the orchestration/docs bucket as the architecture work that enabled probe-1.

**Probe 1 (2026-04-15 07:16 → 04-16 04:09, 20 sessions).** First automated ingest. Cost driven by six parallel sub-agent spawns (static / ui-walker / data / external / reconciler / critic), each a full-context fresh session running `reverse-spec-extraction/SKILL.md`. Reconciler + critic are the single largest sessions. Model: Opus 4.6.

**Probe 1.5 (2026-04-16 04:50 → 05:49, 7 sessions).** Controller-as-agent ingest (Track 2). Same fan-out shape as probe-1 — 4 probes + reconciler + critic + controller orchestrator — but fewer jsonl files because the controller itself is the parent session. Ran on warm Docker state initially (contamination issue later fixed).

**Probe 2 (2026-04-16 06:26 → 08:11, 2 sessions).** Single-session oneshot build. Only 2 sessions because oracle + build collapsed into one long executor run. Surprisingly cheap ($114) for the 4.5K-line output — the session ran mostly on cache reads. Opus 4.6.

**Probe 2.1 ex-2.5 (2026-04-16 08:11 → 13:43, 16 sessions).** Most expensive non-orchestration probe at the time ($683). Cost from build-controller dispatching multiple per-slice executors + stronger oracle generation. First probe to use the slice-executor pattern; includes some Sonnet 4.6 sub-agent calls.

**Probe 2.2 ex-2.6 (2026-04-16 13:43 → 16:16, 12 sessions).** Added Playwright journey oracle. Lower cost than 2.1 because the build itself was small — most journey tests failed on selector mismatch, so the executor didn't iterate deeply. Mix of Opus 4.6 and Sonnet 4.6.

**Probe 2.3 ex-2.7 (2026-04-16 17:40 → 20:02, 20 sessions).** Journey-based slicing. Cost ($348) higher per-hour than 2.2 because atomic-task verification triggered more slice-executor re-runs. First probe on **Opus 4.7**.

**Probe 2.4 ex-2.8 (2026-04-17 03:03 → 07:47, 23 sessions).** Largest session count up to that point. Cost spike driven by (a) 14-slice decomposition with per-slice executor dispatches, (b) two build attempts (attempt-1 had scope creep, corrected in attempt-2), (c) slice-executor re-runs after gate failures, and (d) S13 human-override re-planning after J13 was reinstated. Opus 4.7 1M-context throughout.

**Probe 2.5 ex-2.9 (2026-04-18 02:24 → 04-20 03:05, 21 sessions).** First generator-evaluator probe. Controller dispatches a `plan-reviewer` agent between slice-plan and Stage-1 oracle; plan-reviewer ran twice (REJECTED → APPROVED) and caught 4 failures across the two cycles documented in `reviews/plan-review-{01,02}.md`. Ended with 14/14 journeys passing end-to-end on seeded data and oracle 145/145 green. Cost drivers: 1 controller session ($139.70 over ~2,000+ turns of dispatch + gate review), 17 executor sessions ($465 total — oracle + self-inflicted-gate fix + scaffold + S01–S15), and 2 plan-reviewer sessions ($11.46 combined). Notable that the generator-evaluator addition is essentially free: the two plan-review cycles together cost less than any individual slice executor, and total probe cost ($615.65) is within the $600–750 estimate and comparable to probe-2.4 ($566.47) despite adding the new reviewer role. No slice was a cost outlier in active-compute terms — scaffold and S01 sessions stayed open for 2–3h while downstream slices ran concurrently, but their assistant-turn counts are in-line with peers. The most expensive *real* slice was **S04 J02 AR at $45.42** (largest output — full ledger page + shared components); **S03 Upload was $19.84** despite shipping the reusable `UploadDialog` — it landed cleanly with 86 turns. Calendar span is ~49h because the controller session was left open until the operator confirmed journey walks; active wall-clock (non-controller merged intervals) is 4h 27m.

**Orchestration / docs (2026-04-10 → 04-17, 7 sessions).** Contains the architecture doc, HTML proposal, harness-philosophy synthesis, plan-reviewer calibration, CLAUDE.md, agent definition edits, and this report. The $1,832 figure is real — the single 159-hour session is a conversation with ~4,250 assistant turns accumulated over a week of design iteration, and cache reads alone account for 836M tokens across that bucket.

## Cost outliers worth flagging

- **Orchestration dominates.** At $1.8K, the doc/design bucket cost more than any single probe — more even than probe-2.1's full build at $683. The product-design conversation is substantially more expensive than the probes it enabled, because cache-read tokens accumulate linearly with conversation length and the orchestration session is an order of magnitude longer than any probe.
- **Probe-2 is suspiciously cheap ($114).** Despite producing a working 4.5K-line app, probe-2's 2 sessions ran mostly on warm cache (57M cache-read). This confirms the Ralph-loop thesis: once context is cached, iteration is cheap.
- **Probe-2.1 remains the highest-cost non-orchestration probe ($683).** Probe-2.5 ($616) is the second-highest despite adding the plan-reviewer agent and 15 slices — attribution: most slice executors ran short (3–13 min, $11–$46 each) and the generator-evaluator addition cost <2% of the probe total. The "absorb-gate" failure pattern that spiked probe-2.4 did not recur: plan-reviewer cycles are strictly cheaper than the controller re-work they replace.
- **S03 Upload is not an outlier.** Despite shipping the reusable `UploadDialog` used by both J13 scan upload and J13 bank-statement upload, S03 came in at $19.84 / 86 turns — mid-pack among the 15 slices. The most expensive real slice in probe-2.5 was S04 (J02 Accounts Receivable, $45.42) because it shipped the full ledger page + shared components first.

## Methodology footnote

- **Session attribution.** Each `.jsonl` file was read line-by-line; sessions were bucketed to probes by (a) parent project directory (`probe-2-5/` → probe-2.1, etc.) for the probe-specific project dirs, and (b) regex on the first user message for the main dir (`autoship-probe-N.M` path match; `probe N.M` fallback; `<local-command-caveat>`/design-question → orchestration). All probe-1 and probe-1.5 sub-agent fan-out sessions live in the main dir because they predate the per-probe project split; they were identified by the `autoship-probe-1` / `autoship-probe-1.5` path in their dispatch prompt. Probe-2.5's project directory on disk is `-probe-2-5/` (new name) and contains a mix of pre- and post-rename sessions; post-rename sessions were identified by `first_ts >= 2026-04-18`.
- **Plan-reviewer session attribution.** The two plan-reviewer sessions for probe-2.5 are tallied in the main probe row (not split into a separate bucket). They are dispatched by the build-controller and share its cwd, so they live alongside executor sessions in the probe-2-5/ project dir. Their combined cost ($11.46) is folded into the probe-2.5 total; the per-probe breakdown calls them out explicitly.
- **Pricing.** Opus 4.6 and Opus 4.7 (including 1M-context) were all priced at Opus 4 standard rates: input $15, output $75, cache-creation $18.75, cache-read $1.50 (per 1M tokens). A small number of Sonnet 4.6 sub-agent calls (965 assistant turns across probes 2.1 and 2.2) were priced at Sonnet rates: input $3, output $15, cache-creation $3.75, cache-read $0.30 (per 1M). Probe-2.5 is 100% Opus 4.7 1M-context per the model pins in `build-controller.md` and `plan-reviewer.md`. 16 "<synthetic>" assistant events were also present (harness-internal) and contribute no tokens.
- **Wall-clock.** Per-probe active wall-clock is computed as the sum of merged session intervals (so overlapping sessions don't double-count). Calendar span — from earliest session start to latest session end in a probe — is larger for probe-1 (20.9h span vs 1.4h active) because the 4 parallel fan-out agents ran inside a ~30m window but were spread over a day of debugging iterations. Probe-2.5 has the same shape: 49h calendar span because the controller session was left open between journey-walk checkpoints, 4h 27m active on non-controller sessions. Wall-clock excludes the idle gaps between sessions.
- **Probe-0 has no sessions.** Manual pipeline only — verified by grep of all first-user messages for "probe-0" / "probe 0" (zero hits).
- **Cost precision.** The rates above are list prices; invoiced amounts on Anthropic's platform may differ due to tier pricing, prompt-caching promotional rates, or monthly credits. Treat the $5,186 total as a reasonable upper bound on direct API spend.
