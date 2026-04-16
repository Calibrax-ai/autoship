---
name: blocker-escalation
description: Use when the agent-backed control loop cannot safely continue and must emit a structured blocker.
---

# Blocker Escalation

## Overview

Convert unresolved ambiguity, protected-surface conflicts, or non-converging failures into a structured blocker report. This skill stops the loop from guessing when the controller agent needs a human or policy decision.

## When to Use

- The execution loop cannot proceed safely
- A protected artifact or oracle appears wrong
- Repeated iterations are not narrowing the failure class

Do not use when:
- The issue can be solved by a small implementation patch
- The controller agent has already approved a retry path

## Process

1. Summarize the current stage and the failing surfaces.
2. Classify the blocker as implementation failure, artifact ambiguity, oracle contradiction, or policy conflict.
3. Record what was tried and why it was insufficient.
4. State the smallest decision the controller agent or human must make next.
5. Emit the blocker without mutating protected surfaces.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "I can keep trying a little longer" | Repeated blind retries waste the run budget. |
| "The blocker is probably obvious to the user" | The blocker must be explicit and actionable. |
| "I can quietly adjust the oracle" | Protected surfaces are not negotiation targets. |

## Red Flags

- The report says only "stuck" without evidence
- Root cause is mixed with guesswork
- The requested human action is broader than necessary
- A protected file is being modified during escalation

## Verification

- Blocker category is explicit
- Evidence is attached
- The next required decision is concrete
- No protected surfaces were modified
