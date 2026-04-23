# Extract Learnings

Detailed learnings for the `extract` track: reverse-spec extraction, oracle construction, build orchestration, and plan review against prototype-derived artifacts.

For cross-track synthesis, see [`learnings.md`](/Users/shyangcalibrax/Documents/Projects/autoship/docs/learnings.md).

| Probe | What it tested | Key outcome |
|---|---|---|
| 0 | Manual end-to-end ingest | Pipeline shape validated; 6 skill updates; critic escalation works |
| 1 | Automated ingest (`autoship.sh` + `--agent`) | `--agent` dispatch works; output schemas prevent thin merges (3.3x improvement) |
| 1.5 | Controller agent (Track 2) | Agent-as-orchestrator works autonomously; design schema produces 3x richer output |
| 2 | Ralph loop build (oracle + app from spec) | Spec pack drives a real rewrite; oracle quality is the system's ceiling |
| 2.1 | Build-controller + stronger oracle + vertical slices | API layer excellent (122/122 pass); frontend is a disconnected shell |
| 2.2 | Playwright journey tests added to oracle | 28/29 journey tests fail on selector mismatch; UI orphaned pages worse than probe-2 |
| 2.3 | Journey-based slicing + atomic-task verification | Orphan pages fixed; new failures: dialog theater; empty-state blind spot; screenshots never consulted |
| 2.4 | Sample-data seeding + screenshot-as-layout-contract + 5 forcing-function gates | Gates absorbed: controller passed each by documenting a defensible-sounding cut. Failure shape: self-evaluation, not coverage |
| 2.5 | Dedicated `plan-reviewer` between slice-plan and Stage 1 oracle | Validated. Reviewer REJECTED plan-01, APPROVED plan-02. Build shipped 14/14 journeys + 145/145 oracle cleanly |

---

## The pipeline works end-to-end

Demo -> reversed spec -> oracle -> build converges. Probe-2 produced a working full-stack app from a large spec pack with zero human intervention. The main lesson was not "AI can write code"; it was that autoship can generate enough structure for a builder to do useful work.

**Implication:** the product thesis is viable. The difficult part is extraction and contract quality, not syntax generation.

## Oracle quality is the ceiling

Probe-2 made this explicit: a weak oracle produces false confidence. Tests all passed, but large parts of the product could still have been behaviorally empty.

The key pattern through probes 2 -> 2.2:

- stronger API checks revealed frontend absence
- stronger frontend presence checks revealed dead write paths
- stronger journey coverage revealed selector drift and static-test limitations

**Implication:** the executor optimizes for whatever the oracle measures. Anything unmeasured is treated as optional.

## Static UI tests before the app exists do not work

Pre-generated Playwright tests failed mostly because selectors are implementation-shaped. The executor can satisfy the product and still fail a frozen selector guess.

**Implication:** UI journey validation belongs in the build loop, after code exists. API contracts are stable enough to pre-generate. UI selectors generally are not.

## Slice by product journey, not by data domain

Data-domain slicing left cross-domain pages orphaned. Journey-based slicing fixed the orphan-page problem because the product is experienced as a journey, not as a table.

**Implication:** the slice axis must match the user-visible unit.

## Assertion depth determines behavior depth

When tests only assert that an affordance exists, the executor builds the affordance and stops. When tests assert post-action state, the executor builds the real behavior.

This is where "dialog theater" came from: weak assertions produced plausible-looking but behaviorally empty flows.

**Implication:** verification commands must assert post-action outcomes, not just visible controls.

## Atomic tasks with executable verification close the self-assessment gap

The four-field task schema remained stable across probes:

- `goal`
- `reads`
- `writes`
- `verification`

That schema matters because it replaces self-assessment with executable proof. It also bounds blast radius and makes controller/executor handoff concrete.

## Schemas and examples materially improve artifacts

Whenever the artifact schema was explicit and backed by examples, output quality jumped. When schemas were loose, agents produced thin merges and underspecified outputs.

**Implication:** every load-bearing artifact needs a schema and a depth floor.

## Disk-backed state and fresh-context execution held up

Several architectural bets remained consistently strong:

- externalized state
- fresh session per unit
- agent definitions as declarative configuration
- controller pattern with explicit handoff artifacts

These did not show the same repeated structural failures as the oracle/reviewer layers.

## The accumulated-gates pattern failed

Probes 2.2 -> 2.4 repeatedly showed that adding more gates to the same author does not fix self-evaluation. The controller learned to satisfy each new gate procedurally while reproducing the same semantic failure.

**Implication:** the problem was not missing gates. The problem was author-as-judge.

## Plan-reviewer was the structural fix

Probe-2.5 validated the dedicated reviewer pattern at the planning layer. The reviewer caught substantive failures before any executor ran, and the build completed cleanly after a revised plan was approved.

This is the cleanest evidence in the extract line that the generator-evaluator pattern is not theory. It changed outcomes.

## What stayed right across the extract probes

- Fresh context per executor
- Disk-backed handoff artifacts
- Four-field atomic task schema
- Screenshot-as-layout-contract, once actually consulted
- Controller/executor split

## Extract open questions

1. How does calibration drift over time as operator overrides accumulate?
2. Can the reconciler be parallelized, given its consistent share of wall time?
3. Does the extract pipeline generalize cleanly to a different prototype?
4. What is the practical context ceiling for oneshot builds on current models?
5. Does slice-completion need its own reviewer, or is plan-reviewer sufficient?
6. Which current gates are still load-bearing, and which are dead scaffolding from earlier model behavior?
