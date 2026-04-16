---
name: frontend-regeneration
description: Use when the frontend must be rebuilt from accepted artifacts and design direction rather than preserved from the prototype UI.
---

# Frontend Regeneration

## Overview

Regenerate the frontend from accepted artifacts, user journeys, and design direction. The execution agent uses this skill to build a clean product surface for the autoship loop.

## When to Use

- Accepted artifacts exist
- The frontend is prototype-only, unstable, or missing
- Journey verification depends on stable screens and interaction surfaces

Do not use when:
- The artifact pack is still unstable
- The task is backend-only
- The goal is to patch a small UI defect in an otherwise accepted frontend

## Process

1. Read the accepted artifacts, user journeys, design direction, and relevant policy defaults.
2. Rebuild the frontend around intended workflows, not prototype markup.
3. Stabilize screen structure and navigation before polishing details.
4. Use existing frontend skills as execution playbooks, not as a substitute for accepted artifacts.
5. Modify only allowed frontend code and config.
6. Do not modify accepted artifacts, oracles, or other protected surfaces.
7. Hand off stable flows to the controller agent for journey verification.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "The old UI already works, so I should keep it" | Prototype UI is usually not the target. |
| "I'll change the journeys to match the UI" | Journeys come from artifacts, not convenience. |
| "Visual polish can wait until later" | Unstable surfaces make verification brittle. |

## Red Flags

- You are following prototype DOM structure instead of accepted journeys
- You need to change artifacts to justify the UI
- Navigation and screen boundaries keep shifting
- The UI does not clearly support the intended workflow

## Verification

- Core flows from the journey artifacts are represented
- The frontend compiles and runs
- Stable surfaces exist for journey checks
- Accepted artifacts and oracle files were not modified
