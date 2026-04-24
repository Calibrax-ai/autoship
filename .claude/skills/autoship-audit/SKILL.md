---
name: autoship-audit
description: Use when autoship audit mode assesses a known repo for production readiness, launch go/no-go, or client handoff risk.
---

# Autoship Audit

## Overview

Autoship's audit track exists to answer one upstream question: **what work should exist before we spend build effort?**

This skill is **audit-only**. It does not remediate code, silently choose tools the repo has not chosen, or continue into implementation. It stops at:

- evidence-backed readiness findings
- a top-level launch verdict
- bounded issue candidates for downstream execution

## When to use

Use this skill when:

- The controller has placed the run in `audit` mode.
- The repo is known, but production readiness or launch/handoff risk is not.
- You need to turn repo evidence plus repo standards into execution-ready issues or explicit decision requests.

Do not use when:

- The next step is grooming or building an already-approved issue. Use `deliver` workers instead.
- The software itself is still unknown and needs reverse-spec extraction first.
- You are already in implementation mode. Audit does not fix code.

## Inputs and precedence

Audit decisions follow this order:

1. **Policy** — `.autoship/standards.yaml`
2. **Repo evidence** — `.env.example`, CI files, deploy config, infra files, tests, docs
3. **Cheap verification** — safe commands such as tests, build, typecheck when useful
4. **Inference**

If policy and repo evidence do not constrain the choice, return `decision-required`. Do not invent a platform standard.

## Core workflow

1. Read `.autoship/standards.yaml` if present.
2. Inspect the real repo: build files, workflows, deploy path, env docs, tests, operational docs, infra config, auth/tenant boundaries, job/queue surfaces, and performance-sensitive paths.
3. Run only cheap, non-destructive verification commands when useful.
4. Score findings using the exact vocabulary:
   - `PASS`
   - `FAIL`
   - `UNVERIFIED`
5. Rank actionable gaps:
   - `P0 before launch`
   - `P1 before client handoff if possible`
   - `P2 after controlled rollout`
6. Classify each actionable gap:
   - **execution-ready** — repo standards or existing repo shape already constrain the fix
   - **decision-required** — the capability gap is real, but the implementation path is not chosen
7. Synthesize bounded issue candidates.
8. Stop.

## Required coverage

Every assessment must include these checklist rows. Use only `PASS`, `FAIL`, or `UNVERIFIED`, and cite evidence for each row. If a surface appears not to apply, keep the row and cite the repo evidence that supports that conclusion.

- Build/release path
- CI/test gates
- Deploy/runtime config
- Required production config/env
- Auth and access control
- Security basics
- Tenant isolation and cross-tenant data access
- Role/RBAC boundaries and privilege escalation paths
- Data safety, migrations, backups, and rollback
- Background jobs, queues, scheduled tasks, and webhooks
- Observability, logging, and error reporting
- Performance/scalability baseline
- Operational docs and handoff

Security basics includes HTTPS/security headers where the app serves HTTP, dependency/security scan signals, input validation on external inputs, injection/XSS/CSRF-relevant controls where applicable, secret leakage checks, webhook signature validation where webhooks exist, abuse/rate-limit controls for exposed endpoints, and dangerous debug/admin surfaces.

Tenant isolation includes tenant-scoped reads/writes, organization membership boundaries, cross-tenant query risk, invite/member flows, admin escalation paths, and service-role usage. A multi-tenant app with unverified tenant isolation is not launch-ready.

Background-job coverage includes worker deployment, retries, idempotency, rate limits, scheduled-task ownership, webhook replay behavior, and dead-letter or failure handling where those surfaces exist.

Performance coverage includes latency or capacity expectations when available, obvious hot paths, pagination, database indexes, N+1 risks, cache assumptions, large payload handling, and any cheap smoke/load check the repo already supports.

## Evidence discipline

- `PASS` requires direct evidence.
- `FAIL` requires a concrete gap, broken signal, or dangerous default.
- `UNVERIFIED` is mandatory when the item was not actually checked.
- Failed or un-runnable tests are a release-confidence problem, not a side note.
- A finding without evidence is a hypothesis, not an audit result.

## Issue-candidate contract

Each issue candidate must include:

- `title`
- `priority`
- `classification` (`execution-ready` or `decision-required`)
- `problem`
- `evidence`
- `risk if not fixed`
- `acceptance criteria`
- `verification`
- `scope notes`

## Assessment artifact shape

The auditor writes exactly one markdown file — the filled-out template at `assets/assessment-template.md`. The template is the contract for what sections must exist and in what order. `audit-reviewer` checks well-formedness against the same template.

## Verdict thresholds

The top-level `verdict` field on the assessment follows these rules:

- **`do-not-ship`**
  - any `P0` finding exists, or
  - launch-critical items are `UNVERIFIED` (build/release path, deploy path, required production config, auth/access control, security basics, tenant isolation for multi-tenant apps, data safety, rollback path, async processing for critical jobs/webhooks)

- **`ship-with-caution`**
  - no `P0`, but at least one `P1`, or
  - non-critical items remain `UNVERIFIED`, or
  - important hardening is missing even though the core path is evidenced

- **`ship`**
  - no `P0`
  - no `P1`
  - no launch-critical `UNVERIFIED`
  - remaining `P2` items are clearly deferrable

If evidence does not clearly support `ship`, do not upgrade the verdict. Reviewers: a verdict looser than the evidence supports is FAIL on verdict correctness.

## Hard rules

- Do not fix code in the same run.
- Do not silently upgrade `decision-required` into `execution-ready`.
- Do not call something production-ready on optimism.
- Do not collapse multiple unrelated fixes into one vague issue.
- Do not treat `.env.example` as policy; it is evidence.
