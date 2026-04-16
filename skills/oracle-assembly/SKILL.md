---
name: oracle-assembly
description: Use when accepted artifacts must be compiled into a protected oracle bundle for the autoship loop.
---

# Oracle Assembly

## Overview

Compile accepted artifacts into the oracle bundle that the agent-backed control loop uses to judge implementation quality. This skill creates evaluative checks, not product code.

## When to Use

- Accepted artifacts exist for the current run
- The controller agent needs pass/fail gates
- The execution agent needs deterministic checks to work against

Do not use when:
- Artifacts are still under dispute
- The goal is to patch code instead of define checks

## Process

1. Read only accepted artifacts and policy defaults.
2. Generate layered oracles such as contract tests, state assertions, journey checks, policy checks, and approved baselines when applicable.
3. Keep the oracle bundle separate from app code and other protected surfaces.
4. Make required checks explicit so the controller agent can decide whether to continue, retry, or escalate.
5. Surface contradictions instead of smoothing them over.
6. Do not modify frontend or backend implementation files.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll make the tests broad so the build can pass" | Weak checks collapse the loop. |
| "The spec is probably good enough" | Contradictions should be surfaced, not ignored. |
| "One E2E flow is enough" | A single test type is not a reliable oracle. |

## Red Flags

- Different artifacts imply conflicting endpoint or state behavior
- The oracle bundle depends entirely on one inferred source
- A test is written mainly to be easy to satisfy
- You are trying to fix app code while assembling oracles

## Verification

- Required oracle layers are present
- Policy defaults are enforced where relevant
- Contradictions are surfaced as blockers or notes
- Oracle files are separated from mutable app code
