---
title: "Decision Log"
---

**Status:** v0.3 design · **Last updated:** 2026-04-28

## In plain English

The controller and its workers make inferences during every run — *"use Linear team FRD because it's the only team in the workspace,"* *"gate the build on `bun test` because `package.json:scripts.test` exists and the baseline is green,"* *"set source to Linear because `linear auth list` is authenticated and `.autoship/issues/` is empty."* These inferences used to live in two awkward places: re-stated as required config in `.autoship/defaults.yaml`, or surfaced as permission-request prompts mid-run.

Both are wrong shapes. Routine inferences shouldn't demand operator restatement, and they shouldn't pause the run for a `[y/N]`. They should **default to action**, with a structured trail an operator can read after the fact.

The decision log is that trail. Every non-trivial inference autoship makes during a run gets one append-only JSONL record under the run directory. The log is the **license to act**: without it, default-to-act feels like agent autopilot; with it, default-to-act is delegation with receipts.

## What gets logged

Three categories of events:

1. **Inferences** — the agent picked a value from evidence the operator did not explicitly configure. Example: `validation.commands` derived from `package.json:scripts.test`.
2. **Resolutions** — the agent picked a value from explicit config that had multiple sources of truth (e.g. `defaults.yaml` value overrode an inference; CLI flag overrode `defaults.yaml`). Recording resolutions lets operators audit precedence after the fact.
3. **Halt-on-ambiguity events** — the agent considered an inference, found genuine ambiguity (e.g. multi-team Linear workspace, both source candidates active), and halted instead of guessing. Logging the halt itself is the audit trail for *why* a run stopped, distinct from a generic preflight blocker.

What is NOT logged:

- Trivial baked-in framework defaults (`pr.draft: true`, `worktree.root: .autoship/worktrees`). They never vary; logging them is noise.
- Run-level mechanics (worktree path, branch name) — those already live in `oracle/result.md` and `pr.md` per issue.
- Worker-internal reasoning steps (e.g., the spec-reviewer's verdict rationale). Those belong in `reviews/review-NN.md`, not the decision log.

The threshold: *would an operator want to know this happened, in case they need to override it later?* If yes, log it. If no, skip.

## File path and lifecycle

```
.autoship/runs/<run-id>/inferences.jsonl
```

- One file per run. Created lazily on the first inference; absent if a run had no loggable events.
- Append-only. Records are written one per line, never rewritten or reordered.
- Persists for the life of the run directory. No rotation, no truncation.
- Co-located with `invocation.txt`, `run.json`, `decisions.log` — same `runs/<run-id>/` directory.

The existing free-form `decisions.log` (state transitions, worker dispatches, prose) stays. `inferences.jsonl` is the structured machine-readable counterpart, not a replacement.

## Schema

One JSON object per line. UTF-8. No trailing comma, no surrounding array.

```json
{
  "timestamp": "2026-04-28T12:34:56.789Z",
  "phase": "preflight",
  "key": "validation.commands",
  "value": ["cd backend && bun run typecheck"],
  "evidence": "package.json:scripts.test exists; baseline pass on cd backend && bun run typecheck (~3s); frontend typecheck red on main, excluded from gate",
  "source": "controller",
  "reversible_via": "deliver.validation.commands in .autoship/defaults.yaml; or pass --validate=<command> on the next run"
}
```

### Required fields

| Field | Type | Description |
|---|---|---|
| `timestamp` | ISO 8601 string (UTC) | When the inference was made. Millisecond precision. |
| `phase` | string | Lifecycle phase: `preflight`, `groom-start`, `groom`, `build-start`, `build`, `verify`, `pr`, `halt`. |
| `key` | dotted-path string | What was decided. Mirrors the config key it overrides (`deliver.linear.team`, `deliver.validation.commands`, `deliver.source`). |
| `value` | any JSON | The decided value. Null means "deliberately unset / no override." |
| `evidence` | string | Why this value, in plain prose. Cite specific files, command outputs, or workspace state. Operators read this to decide whether to trust the inference. |
| `source` | enum | `controller` \| `<worker-name>` (e.g. `deliver-pre-groomer`). The agent that made the call. |
| `reversible_via` | string | Concrete instruction for overriding next time. Either a YAML snippet for `defaults.yaml`, or a CLI flag, or both. Never gesture at "see the docs." |

### Optional fields

| Field | Type | Description |
|---|---|---|
| `notes` | string | Free-form additional context. Use sparingly. |
| `alternatives_considered` | array | Other values the agent could have picked, with brief reasons rejected. Useful when the inference involved real choice (e.g. validation gate selection across multiple test commands). |
| `kind` | enum | `inference` (default) \| `resolution` \| `halt-on-ambiguity`. Implied as `inference` when omitted. |
| `overrode` | object | Present on `kind: resolution` entries. Shape: `{"by": "cli-flag" \| "defaults.yaml" \| "inference", "previous_value": <value>}`. Captures the precedence chain. |

### Halt-on-ambiguity record shape

When the agent halts because evidence is genuinely ambiguous (not because config is missing — that distinction matters), it writes a final record:

```json
{
  "timestamp": "2026-04-28T12:34:56.789Z",
  "phase": "preflight",
  "key": "deliver.linear.team",
  "value": null,
  "kind": "halt-on-ambiguity",
  "evidence": "linear team list returned 3 teams: FRD, INFRA, CORE. Cannot infer scope.",
  "source": "controller",
  "reversible_via": "set deliver.linear.team_key in .autoship/defaults.yaml to one of: FRD, INFRA, CORE",
  "alternatives_considered": [
    {"value": "FRD", "rejected": "no signal to prefer over INFRA or CORE"},
    {"value": "INFRA", "rejected": "no signal to prefer over FRD or CORE"},
    {"value": "CORE", "rejected": "no signal to prefer over FRD or INFRA"}
  ]
}
```

The halt record is always the last line in the file for that run.

## Append discipline

- The controller is the primary writer. Workers may emit inference records by returning structured results that include them; the controller appends to the file (workers do not write directly, preserving the single-writer invariant).
- One record per logical decision. Do not split a single inference across multiple records.
- Never rewrite or delete prior records. If a later phase decides differently, write a new `kind: resolution` record showing the change and pointing back via `overrode.previous_value`.
- Newline-terminate every record. A consumer should be able to `jq -c .` line-by-line without seeking.

## How operators read it

The expected workflows:

1. **After-the-fact audit** — *"what did autoship infer for the FRD-157 build run?"*
   ```
   cat .autoship/runs/<run-id>/inferences.jsonl | jq .
   ```

2. **Spot the override needed** — *"why did it pick this validation gate, and how do I change it?"* Read the `evidence` and `reversible_via` fields for the relevant key.

3. **Audit-pre-rerun** — when a run halts on ambiguity, the last record names the ambiguity and the fix. Operator follows `reversible_via` and re-runs.

4. **Across-run patterns** — *"what does autoship typically infer about this repo?"* Glob across run directories:
   ```
   cat .autoship/runs/*/inferences.jsonl | jq -s 'group_by(.key) | .[] | {key: .[0].key, values: [.[] | .value] | unique}'
   ```

The human-readable surface is the announce block printed at run start by the controller. The JSONL is the durable backing store for that announcement plus everything the announcement summarizes.

## Future consumers

The schema is structured to support things that don't ship in 0.3.0:

- **Trust calibration** — per-operator history of inferences accepted vs overridden. The agent earns the right to skip the announce block on patterns it's been consistently right about. Requires aggregating across run directories; the schema's `key` + `value` + `source` fields are sufficient.
- **Audit-side replay** — given a `verification/result.md` failure, walk back through the run's inferences to identify which inference might have caused the failure. Requires `phase` field plus `timestamp` ordering.
- **Cross-repo standards drift detection** — if multiple repos in a fleet make divergent inferences for the same `key`, that's a signal the policy contract (`standards.yaml`) is incomplete. Requires `key` consistency across runs.

None of these need to ship for the log itself to be load-bearing. The log earns its keep purely as the operator audit trail for run-time inferences.

## Relationship to other artifacts

| Artifact | Role | Frozen? |
|---|---|---|
| `inferences.jsonl` | Run-time inference trail | Append-only |
| `decisions.log` | Run-time prose log of state transitions and worker dispatches | Append-only |
| `invocation.txt` | Raw trigger string (CLI argv or NL prompt) | Frozen at run start |
| `run.json` | Resolved RunRequest (after inferences applied) | Frozen at run start |
| `issue.md`, `spec.md`, `oracle/result.md`, `implementation/result.md`, `verification/result.md`, `pr.md` | Per-issue artifacts | Frozen on write |
| `reviews/review-NN.md` | Reviewer verdicts, one per pass | Append-only (one new file per pass) |

The decision log is the only run-scoped append-only structured store. `decisions.log` is its prose sibling. Issue artifacts capture work product; the decision log captures the reasoning that selected the work's parameters.

## What is explicitly out of scope

- **Centralized aggregation.** No daemon collects logs across runs into a database. Operators run `jq` themselves.
- **Mutable records.** Once written, never edited. Override events become new records, not edits.
- **Cross-run dependencies.** A run reads no decision log other than its own. Trust calibration (above) is a future analytical layer, not a run-time input.
- **Worker-internal reasoning.** Reviewers, oracle writers, and implementers do not write here. Their reasoning lives in their own artifacts.
