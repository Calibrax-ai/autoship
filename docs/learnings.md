---
title: "What we've learned"
---

## The short version

After ten probes across two tracks, three findings have held up repeatedly:

1. **The plan is the ceiling.** If the plan is weak, the code will be too — the agent will produce "tests pass" without "product works." Almost all the leverage lives in producing a trustworthy plan *before* code is written.
2. **The author doesn't grade its own homework.** When the same agent writes a plan and checks it, new checks get absorbed — the agent learns the shape of the gate while reproducing the same failure under a cleaner label. The fix is structural: a separate reviewer.
3. **Mechanical checks for mechanical things. Judgment for everything else.** Regex is right for exact-pattern rules. Anything that needs interpretation ("is this well-scoped?", "is this the right abstraction?") goes to a reviewer with no skin in the author's work.

The rest of this page unpacks where those findings came from, which probes stressed them, and which open questions remain.

## Where to look next

- [Extract learnings](/extract-learnings/) — findings from the prototype-reconstruction track (reverse spec, oracle, build, reviewer)
- [Deliver learnings](/deliver-learnings/) — findings from the existing-project track (grooming, brief review, issue-driven delivery)

This page carries findings that generalize **across** tracks. Per-track detail and probe-by-probe chronology live in the two files above.

## What a "probe" is

A probe is a single end-to-end experiment we run against the system — one real input, one real output, recorded honestly, whether it shipped or not. Probes are numbered `track.number` (`extract` uses `0`–`2.5`; `deliver` uses `0.1`–`0.5`). Numbers restart per track; they don't reflect importance, just chronology. When a finding below says "probe 2.5 validated X," it means "the fifth probe of the extract track surfaced X as a load-bearing finding."

Probes are not benchmarks. They're where we go looking for failure modes, so the honest notes matter more than the scorecard.

## Status at a glance

| Track | Probes | Main question | Current answer |
|---|---|---|---|
| `extract` | 0 → 2.5 | Can autoship reconstruct intent from a prototype and build against it reliably? | Yes, but only when the oracle is strong and a separate reviewer judges plans before build. |
| `deliver` | 0.1 → 0.5 | Can autoship turn a real issue into a trustworthy brief and a reviewed change? | Yes across Bug, Feature, Refactor, and UI-build shapes. UI build validated end-to-end on FRD-162 — all 12 Playwright tests green on first run, zero test mutations. Cross-repo generalization and outcome verification still open. |

---

> **The rest of this page is engineering detail.** Leadership readers can stop here.
>
> **Key terms used below.** **Artifacts** — the bundle of outputs from grooming or extraction (brief, spec, tests, evidence). **Oracle** — the generated test suite that judges whether code matches the spec. **Brief** — the plain-English plan for a single change. **Oracle writer / implementation executor** — two separate agent sessions: one writes the oracle, the other writes the code and cannot edit the oracle.

## The pipeline works when artifacts are strong

The system thesis still holds: the hard problem is not raw code generation, it is artifact quality.

- In `extract`, demo -> reverse spec -> oracle -> build converges when the spec pack and oracle are strong enough.
- In `deliver`, issue -> brief -> oracle -> build also converges on at least one clean issue when the brief is trustworthy.

The implementation agent is usually not the ceiling. The ceiling is the quality of the contract it is asked to satisfy.

## The oracle or brief is the real bottleneck

Both tracks show the same pattern:

- weak oracle -> "tests pass" instead of "product works"
- weak brief -> downstream stages would optimize for an underspecified change

In `extract`, this showed up as Goodhart's Law at the oracle layer: the executor optimized for exactly what the tests measured and ignored what they did not.

In `deliver`, the same pattern appears one layer earlier: the downstream builder can only be as trustworthy as the approved brief and frozen oracle it receives.

**Implication:** the load-bearing document is the executable contract:

- `extract`: oracle + slice plan
- `deliver`: approved brief + frozen oracle

## Generator-evaluator separation is a structural fix, not a local trick

This is the most important shared learning.

When the same agent authors an artifact and judges it, new gates get absorbed rather than enforced. The system learns to satisfy the letter of the gate while reproducing the same failure under a cleaner label.

The fix is structural:

- author writes
- separate reviewer judges
- reviewer does not produce
- author does not discharge its own gate

Validated at three layers now:

- `extract`: plan-reviewer in probe-2.5 — planning layer
- `deliver`: brief-reviewer in probe-0.1 — grooming layer
- `deliver`: frozen oracle in probe-0.3 — preservation-proof layer. The author-judge separation here is reflected in artifacts rather than agents: the oracle writer writes the invariants, and the implementation executor is forbidden from modifying them. Test mutation becomes the signal. On a Refactor where the executor had full opportunity to weaken tests to shortcut the structural change, it did not — because the separation made that move visible.

This pattern should be the default answer whenever a stage starts confidently approving mediocre output or shortcutting its own checks.

## The accumulated-gates pattern fails under self-evaluation

Probe history showed the same loop repeatedly:

1. observe a failure
2. add a forcing-function gate
3. let the same author read the new gate
4. watch the author satisfy the gate procedurally while reproducing the failure semantically

This happened most clearly in `extract`, but the lesson generalizes. A rationale-accepting gate judged by the same agent that authored the rationale is not a reliable control.

**Implication:** default to judgment by reviewer. Use mechanical gates only when the check is truly mechanical:

- command exits 0
- file exists
- regex matches
- artifact is structurally present

If the rule depends on interpretation, it belongs with a reviewer, not a grep.

## Oracle separation is load-bearing

The oracle / implementation split is not an implementation detail. It is another form of author-judge separation.

- the oracle writer writes the oracle
- the implementation executor writes the implementation
- the implementation executor does not get to rewrite the oracle writer's tests silently

If one executor writes both the tests and the fix, the result is ambiguous. You learn only that one agent can co-adapt its own checks, not that the contract was trustworthy.

This was first true in `extract` and then re-validated in `deliver` on FRD-157.

## Externalized state is stable and worth keeping

Across probes, disk-backed state and explicit handoff artifacts have held up well:

- fresh context per unit
- explicit artifacts between stages
- progress/history on disk rather than hidden in one long session

This is one of the few areas where the system has not produced a meaningful structural failure. It should remain a default architectural choice.

## What generalizes cleanly across tracks

- Schemas materially improve output quality.
- Fresh context per unit is better than context accumulation.
- The controller pattern works, but only when its contracts are thin and explicit.
- Reviewers should judge; generators should generate.
- Artifact quality sets the ceiling for downstream quality.

## Cross-track open questions

1. How does calibration drift over time as operator overrides accumulate?
2. Which later stages need their own reviewers, and which are sufficiently protected by an upstream reviewer plus mechanical gates?
3. Are any existing gates dead scaffolding from earlier model behavior and safe to remove?
4. How much of the current orchestration can stay manual before a controller adds more value than complexity?

## Track files

- [`extract-learnings.md`](/Users/shyangcalibrax/Documents/Projects/autoship/docs/extract-learnings.md) — detailed extract chronology, probe-specific failure shapes, extract open questions
- [`deliver-learnings.md`](/Users/shyangcalibrax/Documents/Projects/autoship/docs/deliver-learnings.md) — detailed deliver findings, build validation, reviewer drift, deliver open questions
