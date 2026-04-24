# Frontend Regeneration

Rebuild the frontend from accepted artifacts, user journeys, and design direction rather than preserving prototype UI. This reference is for the `frontend` surface of `extract-build`.

## Use when

- Accepted artifacts exist, including `user-journeys.json` and `design.md`.
- The frontend is prototype-only, unstable, or missing.
- Journey verification depends on stable screens and interaction surfaces.
- The controller has placed the frontend surface active for this iteration.

Do not use when:

- The artifact pack is still unstable (accepted but contested).
- The task is backend-only.
- The task is a narrow UI fix against an already-stable frontend (use a targeted patch, not regeneration).

## Protected surfaces during frontend regeneration

You read, you do not write:

- **Accepted artifacts** — `api-spec.json`, `data-model.json`, `prd.md`, `user-journeys.json`, `external-contracts.json`, `design.md`.
- **Oracle bundle** — read-only judge.
- **Backend application code** — not touched from the frontend phase.

You write:

- Frontend application code (components, routes, styles, client-side state).
- Frontend config and build artifacts scoped to the frontend tree.

## Process

1. Read accepted artifacts, user journeys, design direction (`design.md`), and relevant policy defaults.
2. Rebuild around intended workflows. The question is "what does the journey need the UI to do?", not "what did the prototype already ship?".
3. Stabilize screen structure and navigation before polishing visuals. Journey checks depend on reliable selectors and transitions; unstable structure makes every oracle run brittle.
4. Apply design direction as-accepted — colors, typography, spacing scales, component stylings from `design.md`. Design direction is an accepted artifact; do not reinterpret it.
5. Do not follow prototype DOM structure when journeys imply a different structure. The prototype's demo path is not the product's target.
6. Do not modify accepted artifacts, oracles, backend code, or other protected surfaces.
7. Hand off stable flows to the controller for journey verification.

## Rationalizations

| Rationalization | Reality |
|---|---|
| "The old UI already works, so I should keep it" | Prototype UI encodes demo-path familiarity, not intended journeys. "Works" in the demo sense usually means the demo person knew the exact clicks. |
| "I'll change the journeys to match the UI" | Journeys come from accepted artifacts. If the UI can't support a journey, that's a finding about the UI or a blocker about the journey — never a reason to edit the journey. |
| "Visual polish can wait until later" | Unstable surfaces make verification brittle. Stable structure is not polish; it's what the oracle needs to run reliably. |
| "I'll just tweak `design.md` where it's inconvenient" | `design.md` is an accepted artifact. Inconvenient design direction is a blocker for the controller, not a local edit. |

## Red flags

- You are following prototype DOM structure instead of accepted journeys.
- You need to change artifacts to justify the UI.
- Navigation and screen boundaries keep shifting across iterations.
- The UI does not clearly support the intended workflow.
- Your slice touches backend code.

## Verification

- Core flows from `user-journeys.json` have corresponding screens and transitions in the rebuilt frontend.
- The frontend compiles and runs.
- Screen selectors and navigation are stable enough for journey oracle checks to run reliably (no shifting IDs, no race-conditional mounts on the journey paths).
- Accepted artifacts and oracle files were not modified.

## Notes

Prototype UI is tempting to preserve because it already "works", but "works" in the prototype sense usually means "the demo person knew the exact click path". Journeys encode intent, not click paths. Regenerating against journeys is what turns demo-grade UI into product-grade UI.
