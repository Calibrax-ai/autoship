---
title: "Audit Architecture"
---

**Status:** scaffolded · **Last updated:** 2026-04-24

## Purpose

`audit` is the upstream module for a **known repo with unclear readiness or unclear work queue**.

It answers:

- what blocks launch or client handoff?
- which gaps are execution-ready?
- which gaps still require a human platform decision?
- what bounded issues should exist before `deliver` starts?

`audit` does **not** fix code in the same run.

## Lifecycle

```mermaid
flowchart LR
    A["new"] --> B["audited"]
    B --> C["approved-to-create"]
    C --> D["issues-created"]
```

This is a bounded loop, not a continuous crawler.

## Artifacts

All state lives under `.autoship/audits/<run-id>/`:

- `assessment.md` — auditor output
- `review.md` — audit-reviewer verdict
- `created-issues.json` — tracker issues materialized by the controller

## Agents

| Agent | Role |
|---|---|
| `controller` | Orchestrates the audit run, owns tracker mutations, stops at approved issue creation |
| `auditor` | Produces the assessment plus issue candidates |
| `audit-reviewer` | Fresh-context skeptic for evidence, verdict thresholds, and issue-candidate quality |

## Standards and evidence

Audit uses this precedence:

1. `.autoship/standards.yaml` — policy
2. repo evidence — `.env.example`, CI files, deploy config, infra files, tests, docs
3. cheap verification commands
4. inference

If policy and evidence do not constrain the implementation path, the finding should become `decision-required`, not an invented stack choice.

## Handoff to deliver

The controller may create approved issue candidates in Linear or GitHub, but the default created state is `Backlog`.

That keeps the boundary clean:

- `audit` decides **what work should exist**
- `deliver` handles work only after it is later promoted into `Grooming`
