---
title: "Controller Context Optimization — measured from probe-2.4"
---

**Scope.** Profile the build-controller session that drove probe-2.4 (14 slices + retroactive hardening) and propose surgical edits to `.claude/agents/build-controller.md` that reduce per-slice context spend in probe-2.5+.

**Source session.** `~/.claude/projects/-Users-shyangcalibrax-Documents-Projects-autoship/e3cdeb6b-f1c5-42c6-a905-d2d76d358ac0.jsonl` (6.2 MB, ~1530 entries, 627 assistant turns with usage records).

## Top-line finding — the concern was slightly misframed

The task brief framed the problem as **per-slice context growth approaching 1M**. The data says something different:

- **Max observed context: 232,552 tokens**, not approaching 1M.
- **Auto-compaction fired 7 times** during the probe-2.4 build (at entries 411, 595, 802, 941, 1140, 1318, 1480). Each compaction injects a `"This session is being continued from a previous conversation..."` summary.
- The binding constraint isn't 1M headroom — it's **the auto-compaction trigger (~200K)**. That changes the optimization target: we want to (a) push the next compaction further out, and (b) minimize redundant re-reads that happen _after_ compaction (those pay twice: once before compaction as the original read, again after as the re-read the controller issues to recover state).

Probe-2.9 adds a `plan-reviewer` dispatch at Stage-0 → Stage-1. That's a subprocess launch + a small verdict-file Read — **near-zero cost to the controller**. The plan-reviewer is not the load-bearing worry.

## Measurement table — per-driver cost

Tokens are approximated as chars/4 from tool-result content sizes. The session issued 344 tool_uses across 627 assistant turns.

| Driver | Count | Total tokens | Avg per call | Fat-tail (max single call) | Fix category |
|---|---:|---:|---:|---:|---|
| **Redundant Reads (same path ≥2×)** | ~17 paths | **34,654** | — | `progress.txt` read 15× | controller-side |
| &nbsp;&nbsp;• `progress.txt` | 15 | 20,810 redundant | 5,519 avg | 20,183 (one read) | controller |
| &nbsp;&nbsp;• `decisions.md` | 5 | 3,210 redundant | 3,891 avg | 15,561 | controller |
| &nbsp;&nbsp;• `logs/sNN-prompt.txt` | 3–5 per slice | ~5,000 redundant | varies | 21,777 (s05-prompt.txt) | controller |
| &nbsp;&nbsp;• `user-journeys.json` | 3 | 1,534 redundant | 3,283 | 5,715 | controller |
| &nbsp;&nbsp;• App source files | ~4 paths 2–3× each | ~2,500 redundant | varies | 18,229 (AR page) | controller |
| **All Read calls (non-redundant portion)** | 88 | 52,715 | 992 avg | — | — |
| **Bash output (cumulative)** | 208 | **48,403** | 232 avg | 4,389 (`git show` full diff) | mixed |
| &nbsp;&nbsp;• `git show` w/o `--stat` | several | ~8,000 | — | 17,558 for a single `git show` | controller |
| &nbsp;&nbsp;• `pstree` / `ps -ef` debugging | 8 | ~18,000 | 2,250 avg | 16,030 | controller (forbid) |
| &nbsp;&nbsp;• `tail -N logs/sNN.log` | 25 | ~11,500 | 460 avg | 2,265 | controller |
| &nbsp;&nbsp;• Schema/seed deep-reads (`cat seed.ts`, `sed -n schema.ts`) | ~9 | ~8,000 | 900 avg | 3,313 | controller |
| &nbsp;&nbsp;• `jq user-journeys.json` selection | 12 | ~6,000 | 500 avg | 4,975 | acceptable |
| **Grep/Glob** | 10 | 2,749 | 275 avg | — | cheap |
| **Write/Edit** | 22 | 969 | 44 avg | — | cheap |
| **Monitor (streaming, not context)** | 16 | 835 | 52 avg | — | already correct |

### What post-compaction recovery looks like (the double-pay penalty)

Pattern observed after each compaction:

1. System injects `"This session is being continued..."` summary (~10–20K tokens).
2. Controller re-reads `progress.txt` (full, ~14K tokens).
3. Controller re-reads `decisions.md` or the active `logs/sNN-prompt.txt` (~5–20K).
4. Controller re-runs `git log --oneline -5` to rebuild commit mental model.

That's ~25–50K tokens of recovery after every compaction. Seven compactions × ~35K ≈ **245K tokens** spent on post-compaction state recovery across the probe-2.4 build. This is the single biggest optimization lever.

### Executor logs — already cheap, already structured

Sampled: `stage1.log` (24 lines), `s05.log` (39 lines), `s09.log` (32 lines). Each log follows the same shape:

```
★ Insight ──────────
- 2–4 bullets (30–40% of log)
─────────────────────

## SNN verification summary
| Gate | Result |
| RESET_EXIT | 0 |
| ... |

Last 6 lines of /tmp/sNN-fullsuite.log:
```...```

Screenshot drift vs artifacts/screenshots/...:
- 1–3 bullets

Commit: <sha> <msg>
```

**Implication:** proposal #1 from the task brief (executor emits `sNN-summary.txt`) has near-zero ROI — the log already *is* the summary, and `tail -80` reads the whole thing. The high-ROI version of this fix is to **formalize the gate-table delimiter** and have the controller `sed -n '/^## .* [Vv]erification/,$p'` to skip the `★ Insight` block. Insight blocks are useful for the humans reading logs post-mortem; they're low-signal for the controller's next-slice decision.

## Fix proposals ranked by ROI

### Fix 1 — Targeted `sed -n` section-reads of `progress.txt` (and same for `decisions.md`) 

**Measured cost:** `progress.txt` read 15× for ~83K chars total (~21K tokens redundant). `decisions.md` read 5× for ~13K chars redundant.

**Root cause:** After every compaction (7× in probe-2.4) the controller does a full `Read /path/to/progress.txt` to recover state. Most of those re-reads only needed one section — e.g. the CONVENTIONS block, or the SLICE PLAN table, or the current pointer.

**Fix:** Instruct the controller to use `sed -n '/^===.*CONVENTIONS/,$p' progress.txt` (or similar boundary-anchored reads) by default, and only full-read progress.txt on **first** session start.

**Before/after per slice:**
- Before: ~14K tokens of progress.txt per post-compaction recovery.
- After: ~2–4K tokens (section only).
- **Saving: ~10K tokens × 7 compactions ≈ 70K tokens across a 14-slice probe.**

### Fix 2 — Bash output discipline: cap, forbid reflex-debug, prefer `--stat`

**Measured cost:** ~18K tokens burned on 8 `pstree`/`ps -ef` debug calls, plus ~8K on full `git show` diffs that should have been `git show --stat`.

**Root cause:** Reflex debugging when a dispatch hangs (`pstree -p 11821`) and reflex full-diffs when all the controller needs is "what did this commit touch."

**Fix:** Add an explicit "Bash output discipline" section to build-controller.md:
- Default `tail -30` / `head -30` for any log inspection.
- **Forbid** `pstree` and `ps -ef` — use `Monitor` to watch the log file instead.
- `git show --stat <sha>` by default; only use full `git show` when inspecting a specific file's diff.
- For `jq` into `user-journeys.json`, select a single journey (`.journeys[] | select(.id=="JNN")`) — already mostly done, continue.

**Before/after per slice:**
- Before: ~2K tokens/slice of avoidable Bash output.
- After: ~500 tokens/slice.
- **Saving: ~1.5K tokens × 14 slices ≈ 20K tokens across probe.**

### Fix 3 — Schema/seed convention lookups go through CONVENTIONS first

**Measured cost:** ~8K tokens on `cat oracle/src/test-utils/seed.ts | head -120`, `sed -n '120,200p' seed.ts`, `cat schema.test.ts`, `sed -n '85,115p' schema.ts`, etc. These are convention-discovery reads.

**Root cause:** The controller re-derives column names by reading source when `progress.txt`'s CONVENTIONS section already captures them (e.g. `crinacle_transactions.subtotal_amount NOT subtotal`, `entities.status='active' lowercase`). The Stage-1 oracle verification phase does a legitimate one-time deep-read; subsequent convention lookups are redundant.

**Fix:** Rule — **before Bash-reading schema.ts / seed.ts / schema.test.ts for a convention lookup, check `progress.txt` CONVENTIONS.** Only open source when CONVENTIONS doesn't cover the fact, and then add the fact to CONVENTIONS when confirmed. This is a context-spend rule, not a quality gate.

**Before/after:**
- Before: ~8K tokens across the build on convention rediscovery.
- After: ~2K tokens (legitimate one-time Stage-1 verification).
- **Saving: ~6K tokens across probe.**

### Fix 4 — Formalize executor log format and read only the gate table

**Measured cost:** ~11.5K tokens across 25 `tail -80 logs/sNN.log` calls. Each log is ~35 lines; ~30–40% is the `★ Insight` block, which is for humans not the controller.

**Root cause:** The controller reads whole logs when only the gate table + screenshot drift + commit line matter for next-slice decisions.

**Fix:** Require executors to delimit output with a stable marker (`## SNN verification summary` for the gate table, which they already emit), and instruct the controller to read from that marker forward: `sed -n '/^## S.* verification summary/,$p' logs/sNN.log` — skips `★ Insight`.

**Before/after per slice:**
- Before: ~460 tokens/log read.
- After: ~280 tokens/log read.
- **Saving: ~2.5K tokens across probe.** Small but free — it's a sed change.

### Fix 5 (DEFERRED) — `sNN-summary.txt` separate file

**Why deferred:** the executor log is already the summary. Adding a separate file duplicates content without adding structure the controller doesn't already have from the gate table. Low ROI.

### Fix 6 (FLAG ONLY — requires a new agent) — `oracle-reviewer` agent

**Why flagged, not written:** Task brief says "just flag it — don't write the new agent definition in this pass." The data supports it: the Stage-1 oracle-coverage verification the controller currently does (`cat oracle/...`) is a judgment call (did the oracle silently exclude an in-scope endpoint?), not a mechanical check. It belongs in a reviewer, not the controller. Expected savings if implemented: the schema/oracle deep-read phase currently done in-controller (~8–15K tokens) moves to a fresh-context reviewer session, which costs the controller only a verdict-file Read (~500 tokens).

## Projected per-slice context spend for probe-2.5

Probe-2.9 baseline (before fixes) per slice, approximated from probe-2.4:
- Dispatch prompt assembly + progress.txt re-read: ~15K
- Bash status checks during executor run: ~3K
- Log read + slice gate Bash calls: ~3K
- Plan-reviewer launch + verdict (Stage-0 one-shot, not per-slice): amortizes to ~500 tokens/slice

**Before fixes:** ~22K tokens/slice of controller-visible context work, compounding each compaction cycle with ~35K of recovery cost. Across 14 slices that's ~310K total + ~245K compaction recovery = **~555K cumulative**. Compaction fired 7×.

**After fixes 1–4:**
- Fix 1 saves ~10K per compaction cycle.
- Fix 2 saves ~1.5K/slice.
- Fix 3 saves ~450 tokens/slice (amortized ~6K across probe).
- Fix 4 saves ~180 tokens/slice.
- Per-slice spend drops ~20–25%.
- **Compactions should drop from 7 to ~4**, which is the bigger win because every avoided compaction is ~35K tokens of recovery we don't pay.

Projected total: ~400K tokens of controller-visible work, 4 compactions. That's roughly **25–28% reduction**.

## What's not worth optimizing

- **Cache-heavy steady-state reads.** The system prompt, the build-controller agent definition itself, and the initial `program.md` read are all cache_read on subsequent turns. They're cheap. Don't obsess over shortening the agent file to save tokens you're already not paying.
- **Executor launch Bash commands.** 19 `claude -p` launches total; their stdout is captured to a file, not tailed into controller context. Already correct.
- **Monitor tool usage.** 16 calls, 835 tokens total. Monitor is already doing what it should: streaming without accumulating.
- **`jq` selection against `user-journeys.json`.** 12 calls, ~6K tokens, avg 500. This is journey-by-journey decomposition; selecting a single journey is already the right shape. Don't try to pre-extract all journeys up-front — that defeats just-in-time slice planning.
- **Write / Edit calls.** 22 calls, ~970 tokens. Rounding error.
- **Plan-reviewer dispatch in probe-2.5.** Costs are in a subprocess, not the controller's context window. The verdict-file Read is ~500 tokens.

## Alignment with the "mechanical vs judgment" rule

All four proposed fixes are **mechanical context-spend rules**, not quality gates:

- Fix 1 (section-scoped reads): mechanical — a `sed -n` range is pattern-matching.
- Fix 2 (Bash output caps, `--stat`, forbid pstree): mechanical — output-size discipline.
- Fix 3 (CONVENTIONS-first schema lookup): mechanical — a "cheap lookup before expensive lookup" rule.
- Fix 4 (sed the gate table): mechanical — a fixed marker.

None of them ask the controller to _judge_ anything new. The judgment gates (plan soundness, oracle coverage, slice matches journey) remain with reviewer agents. This satisfies `CLAUDE.md`'s dividing rule: context optimizations are mechanical (token counts are pattern-matchable), reviews are judgment.
