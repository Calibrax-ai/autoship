---
issue: FRD-143
review-of: brief.md
reviewed-at: 2026-04-22T00:00:00Z
reviewer-sha: 2edac08
verdict: APPROVED
---

# Brief Review 01 — 2026-04-22

## VERDICT: APPROVED

## Check 1 — Well-formedness: PASS
The brief carries `design-status: need-info` in the frontmatter — a legitimate terminal state for a Feature brief when the issue has unresolved forks that pre-commit the product's governance model. Mechanically applying the standard Feature schema (Acceptance Criteria, Design Rationale → Alternatives + Picked, four-bucket Blast-Radius, etc.) would force the pre-groomer to author answers to open questions that belong to the customer/operator — the opposite of the scope-discipline rule. The `need-info` output has its own coherent structure: populated frontmatter (issue, issue-rev, groomed-at, trigger, type, design-status), Outcome (≤15 words), an explicit Scope classification enumerating three forks with concrete file/schema implications, a Proposed decomposition into 143a/143b/143c with per-sub-issue previews (must-touch files + reference patterns), an explicit "why it can't be single-sliced" rationale, an Operator action, and a consolidated Evidence-cited block. No section is blank or "TBD" — each open question is named and scoped.

## Check 2 — Groundedness: PASS
Spot-verified every load-bearing citation against the testbed at SHA 2edac08:
- `app/backend/src/middleware/client.ts:14-42` is indeed the single `clientMiddleware` factory doing workspace-membership enforcement (no grant check). Matches the brief's description of the seam where a grant check would plug in.
- `app/backend/src/index.ts:94-115` mounts ~20 route modules on `/api/v1/*`, and `clientMiddleware` is applied as the chokepoint — confirmed.
- `app/backend/src/routes/clients.ts:18-28` filters `GET /` only by `workspaceId`, with no `clientMiddleware` in its own router — confirmed to bypass the chokepoint, matching the brief's claim that the list endpoint needs separate handling.
- `app/backend/src/db/schema.ts:48-59` defines `workspace_memberships(workspaceId, userId, roleKey)` with a `(workspaceId, userId, roleKey)` unique constraint — confirms the brief's framing that "role + entity membership" would fork the semantics of this existing unique constraint.
- `app/backend/src/middleware/require-role.ts` implements `admin > manager > member` hierarchy as claimed.
- The three open questions quoted from the issue (lines 29-33) match issue.md verbatim.
The `need-info` determination is itself grounded: the brief names the forks, cites them to the issue body (lines 20-33), and shows each fork resolves to structurally different file sets.

## Check 3 — Scope sanity: PASS
The decomposition is genuinely multi-slice, not a pre-groomer dodge. Each fork changes different tables / middleware contracts / API surfaces, and the three proposed sub-issues compose cleanly: 143a lands the primitive (schema + helper), 143b consumes the helper at `clientMiddleware` + list endpoint, 143c builds the admin CRUD on top of 143a. Dependencies are stated correctly (143b and 143c both depend on 143a; 143b and 143c are independent of each other). My rubric directs rejection when a multi-slice feature pretends to be single-slice — this brief does the opposite and explicitly flags the multi-slice shape, which is the desired behavior. The sub-issue previews are explicitly labeled "do NOT execute from this brief," preventing an executor from treating this brief as implementable. No scope-creep AC, no "while we're here" additions, no vague never-touch list (the brief itself has no never-touch list because it is not dispatching execution).

## Notes (non-blocking observations)
- The Proposed decomposition (FRD-143a/b/c) is a recommendation to the operator, not a binding ticket structure. The operator is free to split Linear tickets differently (e.g., two sub-issues, or keep one issue and sequence the groom passes) so long as open question #1 is resolved before any executor dispatch. The brief states this correctly under "Operator action" but worth flagging for the downstream reader.
- On re-dispatch of 143a, the pre-groomer will need to populate the full Feature schema including Design Rationale with ≥2 alternatives + Picked + Reason once the customer resolves question #1. The three data-model options enumerated here are good raw material for that future brief, but Alternatives analysis will still need costed comparisons grounded in concrete codebase patterns (e.g., weigh migration cost of extending `workspace_memberships` vs. adding `user_client_grants`).
- Brief does not identify which role (`admin`, `manager`) should have grant-management privileges — correctly deferred to customer input on 143c, but worth naming that as an explicit 143c open question rather than embedded prose.

## Specific objections (only if REJECTED)
(n/a — APPROVED)

## What the pre-groomer must do next (only if REJECTED)
(n/a — APPROVED)
