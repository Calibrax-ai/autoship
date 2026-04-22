# FRD-161 — [Revamp] Redesign UI/UX of Gridfin

**Source:** Linear issue https://linear.app/calibrax/issue/FRD-161/revamp-redesign-uiux-of-gridfin
**Type:** Feature (Revamp / UI-UX)
**Status:** Todo
**Priority:** (none set on Linear)
**Created:** 2026-04-22
**Branch name:** cshyangchng/frd-161-revamp-redesign-uiux-of-gridfin

## Problem

Currently the Gridfin app is using a very standard vibe coded layout with sidebar and each item in it represent a function in accounting system, and each page is very feature dense, it tries to do a lot of things.

In practice, each function will have more tabs like Xero and Quickbook or other modern accounting app to support the function.

We need to redesign the app layout, UI/UX to support that.

## What "current" looks like (research hints for the pre-groomer, cited against SHA 2edac08)

- Top-level nav: sidebar listing accounting functions (see `app/frontend/src/routes/_authed.tsx` and subroutes under `app/frontend/src/routes/_authed/`)
- Per-page density: each function screen (transactions, reconciliation, GL, activity, inbox, customers, etc.) packs filters, tables, detail panels, and actions into one canvas
- Design-system reference is live in-app at `src/routes/_authed/design-system.tsx`
- Tokens + typography live in `frontend/tailwind.config.ts`
- No pre-built component library (no shadcn/Radix); all custom HTML + Tailwind
- Coexistence of semantic tokens (success/warning/destructive) with legacy aliases (green/orange/red/purple); inconsistent rgba() hardcoding alongside token usage

## Reference benchmarks mentioned in issue

- Xero
- QuickBooks
- "other modern accounting app" patterns

Interpreted: tabs-within-function navigation pattern. Sidebar as function-level nav; within each function, tabs for sub-contexts.

## Scope considerations (pre-groomer MUST decide)

This is a full-app revamp intent. The pre-groomer must classify:

- Is this single-slice? (Almost certainly NO.)
- If multi-slice, propose decomposition: what sub-issues compose this? Per-page migration? Shell layout redesign as a pre-cursor? Design-direction decision as its own pre-cursor?
- What's the sequence? What's blocking what?

## Operator expectations (honest framing)

This issue is intentionally open-ended. The pre-groomer is NOT expected to produce an implementable unified brief. Expected output:

- `design-status: need-info` with proposed decomposition, OR
- A very narrow slice brief (e.g., "just the shell layout migration") IF the pre-groomer judges that a single self-contained first step exists and explicitly defers the rest

Do NOT force a unified brief. Do NOT write 200 acceptance criteria. The probe-0.4 question is whether the pre-groomer correctly recognizes scope and produces a useful decomposition or narrow slice.

## Constraints

- Testbed: app/ (git worktree at SHA 2edac08, detached HEAD, clean)
- Stack: React 19 + Vite + TanStack Router + Tailwind + custom components
- Frontend source: app/frontend/src/
- Scope: frontend/UI only. Backend API shape should NOT change as part of this issue's scope unless a specific sub-issue justifies it.
- Design direction (tabs-per-function) is not yet committed by the operator; the groom must NOT assume it.

## What must NOT change outside this issue's scope

- Authentication (Clerk integration)
- Backend API shape (unless a decomposed sub-issue explicitly scopes this)
- DB schema, migrations, backend services
- The existing `/design-system` design-token definitions in `tailwind.config.ts` (those are the foundation, not in scope for this revamp)

## Evidence to cite during grooming

- Routing: `app/frontend/src/main.tsx`, `app/frontend/src/routes/_authed.tsx`, files under `app/frontend/src/routes/_authed/`
- Existing design substrate: `app/frontend/tailwind.config.ts`, `app/frontend/src/routes/_authed/design-system.tsx`
- Representative dense pages to assess cognitive load: transactions, reconciliation, GL pages under `_authed/`
- Existing navigation components (wherever the sidebar is rendered)
