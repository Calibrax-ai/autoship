---
name: backend-rewrite-loop
description: Use when accepted artifacts and protected oracles exist and the backend must be implemented through bounded iteration.
---

# Backend Rewrite Loop

## Overview

Implement backend code in bounded iterations against accepted artifacts and a protected oracle bundle. This skill is for execution, not artifact revision. The controller agent decides when to continue, retry, or escalate.

## When to Use

- Accepted artifacts exist
- The oracle bundle exists
- Backend functionality is missing, incomplete, or failing required checks

Do not use when:
- The reversed spec is still disputed
- The oracle bundle is known to be invalid
- The blocker requires artifact or oracle revision instead of coding

## Process

1. Read only accepted artifacts, the oracle bundle, run state, and allowed policy defaults.
2. Modify only backend application code, migrations, and allowed runtime configuration.
3. Do not modify accepted artifacts, the oracle bundle, budgets, or blocker reports.
4. Implement the smallest viable slice that moves the loop forward.
5. Run the required deterministic checks.
6. Patch implementation-level failures and repeat within the run budget.
7. Escalate if progress depends on changing a protected surface or resolving ambiguous intent.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "I'll tweak the tests to keep moving" | The execution agent must not rewrite the judge. |
| "The spec is probably wrong, I'll fix it silently" | Wrong spec means escalate or revise explicitly. |
| "I can patch many things at once" | Wide changes make failures harder to localize. |

## Red Flags

- You want to edit oracle files
- The same failure repeats without narrowing
- A passing patch violates accepted artifacts or policy defaults
- You are solving ambiguity with silent invention

## Verification

- Required backend oracle checks pass
- No protected surfaces were modified
- Policy defaults still hold
- Remaining issues, if any, are emitted as structured blockers
