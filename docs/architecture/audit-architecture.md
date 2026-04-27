---
title: "Audit Architecture"
---

**Status:** scaffolded · **Last updated:** 2026-04-27

## Purpose

`audit` is the upstream module for a **known repo with unclear readiness or unclear work queue**.

It answers:

- what blocks launch or client handoff?
- which gaps are execution-ready?
- which gaps still require a human platform decision?
- what bounded issues should exist before `deliver` starts?
- what is exposed at the public production edge, if a URL is configured?

`audit` does **not** fix code in the same run.

## Lifecycle

```mermaid
flowchart LR
    A["new"] --> B["audited"]
    B --> C["approved-to-create"]
    C --> D["tracker-synced"]
```

This is a bounded loop, not a continuous crawler.

## Artifacts

All state lives under `.autoship/audits/<run-id>/`:

**Canonical (every run):**

- `invocation.txt` — raw trigger string
- `run.json` — normalized RunRequest
- `standards.yaml` — snapshot of repo policy when present
- `assessment.md` — auditor output
- `review.md` — audit-reviewer verdict

**Tracker layer (only when `tracker != none`):**

- `prior-issues.json` — open project issues + closed audit-sourced issues (180-day window) at run start
- `tracker-sync.json` — per-candidate action log (`created` / `linked-existing` / `commented-existing` / `planned` / `failed`)

When the tracker layer is active, candidates in `assessment.md` carry `prior-issue-status` + `prior-issue-reasoning`, and `review.md` includes Check 6 (tracker-sync annotation correctness). See [`audit-tracker-sync.md`](./audit-tracker-sync.md).

The active audit pointer, if needed for resume, is `.autoship/audits/current`.

## Agents

| Agent | Role |
|---|---|
| `autoship-controller` | Orchestrates the audit run, owns tracker mutations, stops at approved issue creation |
| `audit-auditor` | Produces the assessment plus issue candidates |
| `audit-reviewer` | Fresh-context skeptic for evidence, verdict thresholds, and issue-candidate quality |

## Standards and evidence

Audit uses this precedence:

1. `.autoship/standards.yaml` — policy
2. repo evidence — `.env.example`, CI files, deploy config, infra files, tests, docs
3. safe external exposure observations, when `external_exposure.enabled: true`
4. cheap verification commands
5. inference

If policy and evidence do not constrain the implementation path, the finding should become `decision-required`, not an invented stack choice.

## External exposure

Audit can optionally run a black-box external production exposure smoke test against the URL declared in the trigger (flag `--external-url=<url>` or per-repo sticky in `.autoship/defaults.yaml`). Disabled by default.

This is not a UI walker and not a pentest. It checks public-edge readiness signals such as TLS, redirects, security and cache headers, CORS, public API auth gates, version leakage, robots/indexing, health/docs/debug endpoints, and explicitly configured login/session smoke checks.

Safety rules:

- default methods: `GET`, `HEAD`, `OPTIONS`
- login `POST` only when explicitly enabled
- no `DELETE`, `PUT`, `PATCH`, non-login `POST`, uploads, password reset, fuzzing, credential stuffing, or load testing
- if a safe read proves the issue, stop rather than mutating state
- redact sensitive response values

## Parallelism

Audit is serial by default at the agent boundary: one auditor writes `assessment.md`, then one reviewer judges it. Do not split into parallel specialist auditors until a probe shows the single assessment path is too slow or too shallow.

Inside the auditor, independent read-only checks can be batched or run concurrently when that does not blur evidence ownership. The output remains one assessment with one severity model.

## Tracker sync (opt-in)

The default `audit` path is markdown-first: `assessment.md` and `review.md` are the canonical artifacts. No tracker writes, no prior-issue annotations on candidates, no Linear MCP calls.

When an operator configures `tracker: linear` (with or without `create_issues: true`), the controller runs an additional reconciliation pass: prior-context fetch, candidate annotations, reviewer Check 6, and per-candidate mechanical dispatch into Linear. That layer is documented separately in [`audit-tracker-sync.md`](./audit-tracker-sync.md) so the markdown-first reader isn't bombarded with mechanics they don't need.

Refresh of artifacts when this layer is active: `prior-issues.json` (input cache) and `tracker-sync.json` (per-candidate action log) appear under `<run-dir>/` alongside the canonical artifacts.

## Handoff to deliver

The controller may create approved issue candidates in Linear, with default created state `Backlog`.

That keeps the boundary clean:

- `audit` decides **what work should exist**
- `deliver` handles work only after it is later promoted into `Grooming`
