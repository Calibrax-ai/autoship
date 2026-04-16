---
name: reverse-spec-extraction
description: Use when a vibe-coded prototype must be reconstructed into intent-bearing artifacts before any rewrite begins. Protocol for an orchestrating agent to boot the prototype, fan out parallel probes by artifact type, reconcile, and critique.
---

# Reverse Spec Extraction

## Overview

Reconstruct a best-effort product spec from a prototype. The prototype is the ground truth for *what exists*; the artifacts express *what is intended*. Distinguishing the two is the whole job.

This is a controller-level protocol, not a single-pass extraction. An orchestrating agent boots the prototype, dispatches parallel probes by artifact type, reconciles their outputs, and runs a critic pass. Behavior observed from the running system takes precedence over inference from static code alone.

**Input/output asymmetry:** autoship's *input* tolerance is "anything that runs" — raw Python scripts, a bare Node server, static HTML, Docker compose stacks, notebooks. Autoship's *output* guarantee is a docker-containerizable app. Extraction normalizes; build containerizes. This skill must boot whatever the prototype is, not demand a specific shape.

## When to Use

- A prototype exists but no reliable spec exists.
- The next stage depends on reversed artifacts.
- The controller needs an intent model before oracle assembly or build.

Do not use when:
- Accepted artifacts already exist for this run.
- The task is implementation, not inference.

## Hard Rules

1. **Ignore human-authored docs in the prototype.** Do not read `README*`, `USER_GUIDE*`, `CHANGELOG*`, `docs/`, or any `.md`/`.pdf`/`.html` that reads like prose documentation. Extract from code, config, data, and running behavior only. Those docs are the answer key — diff against them after the run, never during.
2. **Running behavior > declared code > comments.** When they conflict, the running system wins for *what exists*; mark deltas so the controller can decide intent.
3. **Do not modify the prototype.** It is read-only evidence, not a workspace.
4. **Mark every low-confidence inference.** Ambiguity preserved is safer than ambiguity silently resolved.
5. **Do not trigger globally destructive endpoints.** Paths or button labels matching `reset`, `reset-all`, `truncate`, `drop`, `wipe`, `purge`, `clear-all`, or `delete-all` must be recorded in the observed spec with `not_exercised_reason: "destructive-pattern-skip"` and never called. For user-scoped destructive actions (e.g., `DELETE /api/customers/<id>`), exercise them only against probe-created fixture records, never against data you found in the store. The prototype's data state is part of the evidence; your run must not mutate it. When in doubt, skip and document.

## Protocol

### Phase 0 — Boot

Boot is runtime-agnostic. Detect the prototype's shape, boot it with the minimum isolation that shape allows, verify it responds.

**Step 0.1 — Detect runtime.** Scan the prototype root for signals, in preference order. First match wins:

| Signal | Runtime | Preferred because |
|---|---|---|
| `docker-compose.yml` or `Dockerfile` | Docker | Encodes full stack, cleanest isolation |
| `package.json` | Node (use lockfile: `bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, else npm) | Lockfile picks the exact tool |
| `pyproject.toml`, `requirements.txt`, `Pipfile`, `uv.lock` | Python (prefer uv > poetry > pip) | |
| `go.mod` | Go | |
| `Cargo.toml` | Rust | |
| `Gemfile` | Ruby | |
| `index.html` with no backend signal | Static file server | |
| None of the above | — | Emit `boot-failed` with file inventory |

When multiple signals exist (common: Dockerfile *and* requirements.txt), pick Docker. It's the most reproducible shape and isolates host side effects.

**Step 0.2 — Pick isolation tier.** Isolation is governed by trust, not runtime.

| Trust tier | When | Mechanism |
|---|---|---|
| **sandbox** (default for `npx autoship` against prototypes not authored by the current user) | Untrusted source — prototype came from the wild | E2B sandbox (polyglot, no Docker dependency on user's machine). Docker compose is an acceptable fallback when the user explicitly prefers it. |
| **local** (default for probes, internal runs, and `autoship.config` with `trust: local`) | Trusted source — user's own code | Fresh disposable location on the host: `venv/`, worktree `node_modules/`, scratch tmpdir. Dedicated ports. No global installs. No host package manager mutation. |

Never run on the bare host with no isolation. That is the only hard rule.

**Step 0.3 — Resolve environment.** Before booting, handle env var requirements:

1. If an env file (`.env`, `.env.local`, etc. matching the runtime's conventions) exists, use it as-is. The user/operator's provided values are authoritative.
2. If no env file exists and the prototype references env vars (Docker compose `env_file` directive, `os.environ` / `os.getenv` / `process.env` / `System.getenv` references in source), scan source for every referenced variable name and synthesize an env file with empty-string values for each. Record in the boot report: `env_file_status: { state: "synthesized", synthesized_keys: [...], note: "features requiring live credentials will fail at call time — treat those failures as observational data." }`.
3. Never populate synthesized env files with real-looking credentials, even if a reasonable guess exists. Real credentials change behavior; empty values let probes find the service boundaries naturally.
4. Never modify the prototype's code to bypass env var requirements. Synthesize the env, not the code.
5. If synthesized-empty values would prevent boot (e.g., a DB connection string with no default has no sensible empty value), emit `boot-failed` with the specific keys that need values before progress is possible.

**Step 0.4 — Boot.** Run the prototype inside the picked tier using the detected runtime:

- **Docker (either tier):** `docker compose up -d` on a throwaway network; forward to non-default host ports.
- **Node/Python/Go/Rust/Ruby (local):** install deps into a fresh disposable location, start via the detected entry point, bind to dedicated ports.
- **Node/Python/etc (sandbox):** same commands, executed inside the E2B sandbox; port-forward only what the probes need to reach.
- **Static:** serve from a temp dir on a discovered port.

**Step 0.5 — Discover the entry point.** If not obvious from the runtime (e.g., Node without a `start` script, Python without `__main__`), scan for common patterns: `app.py`, `main.py`, `server.js`, `index.ts`, first route-registering file, first `if __name__ == "__main__"` block. Record the chosen entry point in the boot report so later probes can trace from the same origin.

**Step 0.6 — Verify responsiveness.** For HTTP prototypes: `GET /` returns any 2xx/3xx/404 (anything that isn't connection-refused means the server is up). For non-HTTP: process stays healthy >5s, produces no fatal stderr. For CLI-only prototypes: a sample invocation returns exit 0.

**Step 0.7 — On failure, emit `boot-failed` blocker.** Include: detected runtime, exact commands attempted, full stderr of the last failing command, inferred missing dependency (env var name, missing binary, port conflict, absent service). Do not fall back to static-only extraction silently. The controller decides whether to request human input, try a fallback runtime, or abort.

### Phase 1 — Parallel Fan-Out by Artifact Type

Dispatch four probes in parallel. Each probe has one evidence source, one output, full context isolation. They do not read each other's output during this phase.

| Probe | Primary evidence | Output file |
|---|---|---|
| **ui-walker** | Agent-browser driving the live UI (with deterministic tool access to DOM, network, and screenshots underneath) | `artifacts/user-journeys.json`, `artifacts/api-spec.observed.json`, `artifacts/design.md`, optional evidence in `artifacts/screenshots/` |
| **static** | Route definitions, handler signatures, ORM models, import graph | `artifacts/api-spec.declared.json`, `artifacts/data-model.declared.json` |
| **data** | Live DB schema introspection + sample rows + alternative stores (SQLite, CSV) | `artifacts/data-model.actual.json` |
| **external** | Imports, env vars, outbound HTTP, SDK initializations | `artifacts/external-contracts.json` |

Each probe writes only its assigned files. Probes must not co-write the same file.

**Why four and not five.** Earlier versions of this skill defined `runtime` and `design` as separate probes. They share a browser driver, share traversal cost, and had a cross-probe dependency (design reads runtime's journey list). Merging them into `ui-walker` keeps the traversal cost at one pass and removes the cross-probe read. Validated by probe 01. If a future prototype has a visual-only concern that doesn't benefit from journey traversal (e.g., a design-system audit against a static style guide), re-introduce a dedicated design probe — but don't split by default.

**Ui-walker browser choice.** Default to an agent-browser (e.g., Browser Use, Stagehand, Claude Computer Use, or equivalent). Reason: higher-level navigation planning survives selector brittleness and dynamic SPAs that flat Playwright struggles with. The agent-browser **must** expose structural evidence underneath — DOM snapshots, network traffic interception, screenshots, URL, and an action log — because probe outputs are audited downstream and every journey claim must cite its evidence source. If the selected agent-browser cannot expose that evidence, fall back to direct Playwright MCP.

**Failure-preservation rule for agent-browser.** Agent-browsers are helpful by default — they retry, they fall back to vision-based navigation when selectors fail, they smooth over flaky clicks. That helpfulness can mask real prototype bugs. Ui-walker must treat fallback paths as **findings**, not as silent recoveries:
- A journey is marked `"completed"` only if it succeeded on the first attempted path with no retry.
- A journey that succeeded via fallback gets `"status": "completed-with-fallback"` and its `evidence.action_log` must list every failed attempt, what went wrong, and which fallback succeeded.
- Vision-based fallback when a selector fails is evidence that the affordance the selector targeted is broken or missing — flag it for the reconciler.
- An agent-browser that cannot emit an action log is not acceptable; the probe's audit trail depends on it.

### Output schemas (required depth floor)

Schemas define the **information categories** that each artifact must carry, not exact field names or runtime-specific formats. A Go handler's response type looks different from a Flask handler's — that's fine. What must be present, regardless of runtime, is the information: what method, what path, what location in source, what shapes go in and out, what side effects, what anomalies.

If your output has fewer fields per entry than the example below, you are under-probing. Re-read the source and fill in what's missing. A 6-field endpoint is almost always a thin output, not a simple one.

#### Endpoint schema (shared by `api-spec.declared.json`, `api-spec.observed.json`, merged `api-spec.json`)

**Required per endpoint** (per-probe outputs):

| Field | When required | Content |
|---|---|---|
| `method` | always | HTTP verb or streaming kind (`GET`, `POST`, `WEBSOCKET`, `SSE`, …) |
| `path_template` | always | Route pattern using the runtime's native placeholder syntax |
| `source_location` | always | File + line reference traceable back to source (`path/to/file.ext:line`) |
| `handler_name` | always | Function/handler identifier the route resolves to |
| `request_schema` / `declared_request_schema` | methods with body (POST/PUT/PATCH) | Field-by-field shape: names, types, nullability. `null` for GET/DELETE with no body |
| `response_schema` / `declared_response_schema` | always | Field-by-field shape of each response case. Include error cases when the handler branches |
| `side_effects` / `side_effects_inferred` | always | Array of observable effects (DB writes, external calls, file ops). Empty array allowed |
| `notes` | when applicable | Structural mismatches, low-confidence flags, anomalies. Omit when there's nothing to note |

**Merged-artifact additions** (`api-spec.json`):

| Field | Content |
|---|---|
| `presence` | `declared` \| `observed` \| `both` |
| `schema_agreement` | `match` \| `drift` \| `declared-only` \| `observed-only` (when `presence = both`) |
| `schema_agreement_reason` | Short reason string when `schema_agreement != match` |
| `declared: {...}` | Nested object containing all fields from the declared source for this endpoint |
| `observed: {...}` | Nested object containing all fields from the observed source for this endpoint |

**Example (runtime-neutral — merged endpoint):**

```json
{
  "method": "DELETE",
  "path_template": "/api/v1/users/{id}",
  "presence": "both",
  "source_location": "src/handlers/users.py:142",
  "handler_name": "delete_user",
  "schema_agreement": "drift",
  "schema_agreement_reason": "declared path converter types id as int; DB schema has id as TEXT PRIMARY KEY",
  "declared": {
    "declared_request_schema": null,
    "declared_response_schema": {
      "ok_case": { "ok": "boolean", "deleted": "int" },
      "error_case": { "error": "string" }
    },
    "side_effects_inferred": ["DELETE FROM users WHERE id = ?"],
    "notes": "Path converter type conflicts with column type — low confidence on handler behavior for UUID ids"
  },
  "observed": {
    "status_codes_seen": [200, 404],
    "response_samples": [
      { "case": "ok", "body": { "ok": true, "deleted": 1 } },
      { "case": "not_found", "body": { "error": "not found" } }
    ],
    "side_effects_observed": ["row removed from users table after 200"]
  }
}
```

#### Entity schema (shared by `data-model.declared.json`, `data-model.actual.json`, merged `data-model.json`)

**Required per entity** (per-probe outputs):

| Field | When required | Content |
|---|---|---|
| `name` | always | Entity/table identifier as used in source or DB |
| `source` | always (per-probe) | Storage source for this entry (`postgres`, `sqlite`, `csv`, `orm-model`, `declared-only`, etc.) |
| `fields` (or `columns`) | always | Array of `{ name, type, constraints?, nullability?, default? }` |
| `relationships` | when present | Array of `{ kind, target, via, cardinality }` (foreign keys, joins, join tables). Empty when standalone |
| `notes` | when applicable | Structural findings: multi-tenancy pattern, migration drift, duplicate definitions, type anomalies |

**Merged-artifact additions** (`data-model.json`):

| Field | Content |
|---|---|
| `sources` | Array of sources that define this entity (e.g. `["postgres", "orm-model"]`) |
| `authoritative_source` | Chosen source + one-line reason |
| `drift` | Array of `{ source, diff_kind, description }` for per-source divergences |
| `declared: {...}` / `actual: {...}` | Nested per-source objects preserving original field lists |

**Example (runtime-neutral — merged entity):**

```json
{
  "name": "users",
  "sources": ["postgres", "orm-model"],
  "authoritative_source": "postgres",
  "authoritative_source_reason": "Live DB has migrated beyond the ORM model — two columns present in postgres that the model omits.",
  "fields": [
    { "name": "id", "type": "uuid", "constraints": ["primary_key", "not_null"] },
    { "name": "email", "type": "varchar(255)", "constraints": ["unique", "not_null"] },
    { "name": "tenant_id", "type": "uuid", "constraints": ["foreign_key->tenants.id"], "source": "postgres-only" },
    { "name": "last_seen_at", "type": "timestamptz", "constraints": ["nullable"], "source": "postgres-only" },
    { "name": "created_at", "type": "timestamptz", "constraints": ["not_null", "default:now()"] }
  ],
  "relationships": [
    { "kind": "belongs_to", "target": "tenants", "via": "tenant_id", "cardinality": "many-to-one" }
  ],
  "drift": [
    { "source": "orm-model", "diff_kind": "missing_fields", "description": "ORM model omits tenant_id and last_seen_at present in live DB" }
  ],
  "notes": "Multi-tenant via tenant_id (postgres RLS enforced); ORM model unaware of tenancy."
}
```

### Phase 2 — Reconciliation

A single reconciler agent (fresh context, reads only probe outputs) produces the unified artifacts.

**Merge preservation rule (applies to every merge).** Reconciliation is *additive*, not compressive:

- **Preserve every source field.** Nest per-probe content under `declared: {...}`, `observed: {...}`, `actual: {...}` sub-objects. Do not drop fields you don't recognize. Do not summarize shapes. Do not rewrite type representations.
- **Add reconciliation-level fields on top of the preserved source data** — e.g., `presence`, `schema_agreement`, `schema_agreement_reason`, `sources`, `authoritative_source`, `drift`.
- **Size heuristic.** A correct merged artifact is *larger than the sum of its inputs* — reconciliation adds fields, never removes them. If your merged output is smaller than the combined input size, you have lost information; re-read the sources and restart the merge.
- **Classify mismatches, don't resolve them.** When sources disagree, record both values and classify the disagreement. Never pick a side silently.

- **Merge API specs.** `api-spec.observed.json` and `api-spec.declared.json` → `artifacts/api-spec.json`. Every endpoint is marked `observed`, `declared`, or `both`. Mismatches (declared-but-never-hit, observed-but-undeclared, schema drift) are listed under a `mismatches` array, each classified as `bug` | `dead-code` | `blocked-by-external-service` | `undocumented-behavior` | `unknown`. Classifications are findings, not fixes — the controller decides what to do with them.
- **Merge data model.** `data-model.declared.json` and `data-model.actual.json` → `artifacts/data-model.json`. Each entity has a `sources` array (postgres/sqlite/csv/declared-only), a `drift` array for per-source divergence, and an `authoritative_source` decision with reasoning. Top-level `drift_report` summarizes all divergences across stores.
- **Check referential integrity.** Every endpoint in `user-journeys.json` must appear in `api-spec.json`. Every route in `api-spec.json` must touch entities in `data-model.json` or be explicitly marked stateless. Every external contract must be reachable from at least one route. Failures become `integrity-errors` in `artifacts/reconciliation-report.md`.
- **Produce `prd.md`.** Synthesized from all four probe outputs. Structure: product purpose, primary journeys (cite `user-journeys.json`), data model summary (cite `data-model.json`), external dependencies (cite `external-contracts.json`), known gaps and mismatches, non-goals (inferred). ~800 words; the PRD is a lead-with document and structured artifacts carry the detail.
- **Produce `reconciliation-report.md`.** Integrity-error list + cross-artifact conflicts + classification-confidence notes. This is the forensic handoff to the critic.

### Phase 3 — Critic Pass

A fresh agent reads only the merged artifacts (no prototype access). It answers three questions in writing:

1. **Ambiguity:** what claims in the spec are underspecified to the point that two reasonable rewrites could diverge?
2. **Contradictions:** what statements in one artifact contradict another?
3. **Gaps:** what must exist for the spec to be implementable that is not stated?

Output: `artifacts/critic-report.md`. The controller decides whether to re-run probes, escalate to human, or accept with noted gaps.

## Role Contracts

Each role has owned outputs, explicit rerun semantics, and a required summary format. Prompt wrappers may repeat critical rules for emphasis, but this section is authoritative.

### Rerun semantics (applies to every role)

If your owned outputs already exist when you start, **do not blindly regenerate**. Inspect each output and classify it:

- **usable** — file exists, non-empty, valid per its schema, consistent with the current prototype state.
- **stale** — file exists but reflects a prior prototype state (e.g., boot-report timestamp predates this run).
- **partial** — file exists but the agent that wrote it didn't finish (JSON parses but required top-level keys are missing; array has suspiciously few entries).
- **missing** — file doesn't exist or is empty.

Choose one strategy per owned output:
- `regenerate` — rewrite from scratch (default for partial, stale, missing).
- `continue` — extend/complete an existing partial output (use only when existing content is correct as far as it goes).
- `leave-as-is` — treat the existing file as final (use for usable).

State your per-output decision in the summary. When in doubt, `regenerate`.

### Per-role contracts

| Role | Owned outputs | Allowed evidence | Forbidden |
|---|---|---|---|
| **ui-walker** | `user-journeys.json`, `api-spec.observed.json`, `design.md`, best-effort evidence in `screenshots/` | Live prototype via browser + intercepted network | Source code, other probes' outputs, prose docs |
| **static** | `api-spec.declared.json`, `data-model.declared.json` | Prototype source code | Live prototype, DB, other probes' outputs |
| **data** | `data-model.actual.json` | Live DB + flat files (SQLite, CSV) | Source code, other probes' outputs |
| **external** | `external-contracts.json` | Source imports, env vars, deps manifest, `.env` key list | Live prototype, other probes' outputs |
| **reconciler** | `api-spec.json`, `data-model.json`, `prd.md`, `reconciliation-report.md` | Phase 1 probe outputs only | Prototype, live systems |
| **critic** | `critic-report.md` | Merged Phase 2 artifacts only | Phase 1 probe outputs, prototype, live systems |

Output schemas are defined in the Phase 1/2/3 descriptions above — the contract here covers ownership and rerun behavior, not schema detail.

### Summary format

Every role returns a summary ≤200 words (≤300 for reconciler and critic). It must include:
1. Rerun decisions (if the role started with any owned outputs present): per-output `regenerate | continue | leave-as-is`.
2. Headline findings or what was produced.
3. Anything the next phase should watch for.
4. For `ui-walker`, whether screenshots were captured. If not, state why not. Missing screenshots alone are not a phase blocker.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "The code probably means X, so I can state it as fact" | Hidden assumptions are the main failure mode. Mark them. |
| "I can clean up the prototype while extracting" | Extraction reads; it does not write to the prototype. |
| "I'll skip the boot step — static is faster" | Static alone misses runtime behavior, env-dependent routes, and migration drift. Boot or emit a blocker. |
| "The prototype isn't dockerized so I can't boot it" | Boot is runtime-agnostic. Detect the shape (Node / Python / Go / raw HTML / etc.) and boot that shape. Docker is preferred when available, not required. |
| "The README explains it, let me just use that" | The README is the answer key. Using it short-circuits the test of whether reverse-spec works from evidence. |
| "Observed and declared disagree — I'll pick one" | The disagreement *is* the finding. Record it as a mismatch, do not silently merge. |
| "I hit the reset button to see what happens" | Destructive endpoints are documented by their existence; the runtime probe does not execute them. The prototype's data state is evidence — mutating it corrupts other probes' findings. |
| "I'll keep trying URL variants until I find the right one" | Two navigation attempts max per journey target. If both miss, mark the journey `blocked-other` with the attempted URLs. The reconciler cross-references declared routes to identify the correct URL; brute-forcing wastes probe budget. |
| "The prototype needs `STRIPE_SECRET_KEY` — I'll put a realistic-looking value to get further" | Never synthesize real-looking credentials. Empty values let probes discover the service boundary naturally (auth fails at call time, which is itself evidence). Synthesized credentials that happen to be valid make the run dangerous; synthesized credentials that look valid but aren't make failures misleading. |
| "The agent-browser recovered from the click failure, so the journey passed" | A recovery is a finding. Mark the journey `completed-with-fallback` and record every failed attempt in the action log. The original click-failure is the prototype bug the rewrite needs to fix; smoothing it over corrupts the spec. |

## Red Flags

- You are tempted to read `README.md` to "confirm" an inference.
- A probe is silently falling back to another probe's evidence because its own failed.
- Reconciler is resolving mismatches by picking a side instead of recording them.
- The critic pass surfaces issues that should have been caught by referential integrity.
- You are producing artifacts describing behavior that the running prototype does not exhibit.
- You are about to click a button or call an endpoint whose name matches a destructive pattern.
- Probe run completed but the prototype's data state is different from what Phase 0 observed.

## Verification

- All four probe outputs exist and are non-empty (six core artifact files total: `user-journeys.json`, `api-spec.observed.json`, `api-spec.declared.json`, `data-model.declared.json`, `data-model.actual.json`, `external-contracts.json`, plus `design.md` from ui-walker), or `boot-failed` blocker is emitted. `screenshots/` are best-effort evidence and should be present when capture works, but absence alone is not a blocker.
- Reconciled artifacts include explicit mismatch and integrity-error sections (empty is fine; absent is not).
- `critic-report.md` exists with ambiguity/contradictions/gaps sections.
- No file under `prototype/` has been modified.
- No human-authored prose docs from the prototype were read during extraction.
- The prototype's data state (DB row counts, file listings) at teardown matches Phase 0. Destructive endpoints were recorded, not executed.
