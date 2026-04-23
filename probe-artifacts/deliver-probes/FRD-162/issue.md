# FRD-162 — [FRD-161b] Design-system primitives: Tabs + PageShell

**Source:** Linear issue https://linear.app/calibrax/issue/FRD-162 (sub-issue of FRD-161)
**Type:** Feature (UI — design-system extension)
**Status:** Todo
**Branch:** cshyangchng/frd-162-frd-161b-design-system-primitives-tabs-pageshell
**Parent:** FRD-161 (decomposition proposal). This is §FRD-161b from the parent brief's decomposition.
**Parent brief:** `/Users/shyangcalibrax/Documents/Projects/autoship-deliver-0.5/app/.autoship/issues/FRD-161/brief.md` — CARRIED OVER from 0.4; pre-groomer should read this as enrichment context.

## Scope (from parent brief §FRD-161b)

Add the UI primitives the FRD-161 redesign requires, isolated from any page integration:

- `<Tabs>` primitive — horizontal tab bar + keyboard navigation + active-state animation. Currently not present in `src/components/`.
- `<PageShell>` primitive — reusable container that renders a page's tab bar (or sub-route switcher) and a consistent header/actions area.

Possibly additional primitives (`<SplitPane>`, `<Sheet>`, `<CommandPalette>`) — deferred until parent FRD-161a decides the design direction that requires them.

## Deliverable

New components under `src/components/` plus live demos added to `/design-system` (`src/routes/_authed/design-system.tsx`). NO integration into real pages — that's FRD-161c+ scope.

## Why this sub-issue is direction-agnostic

`<Tabs>` and `<PageShell>` as stand-alone primitives fit all four candidate design directions from FRD-161a (tabs-within-function, split-routes, progressive-disclosure, command-palette). They can exist in the design system without commitment to any particular IA choice.

## Constraints (inherited from FRD-161)

- Testbed: `/Users/shyangcalibrax/Documents/Projects/autoship-deliver-0.5/app/` (git worktree at SHA 2edac08)
- Stack: React 19 + Vite + TanStack Router + Tailwind + custom components
- Frontend: `app/frontend/src/`

## What must NOT change

- `tailwind.config.ts` (design tokens are the foundation, ruled out-of-scope per parent FRD-161)
- Any existing page component (no integration into real pages — only demo additions to `design-system.tsx`)
- Backend API shape, DB schema, Clerk auth middleware
- Any existing component under `src/components/` (net-new components only)

## Acceptance criteria (pre-groomer should refine)

- `<Tabs>` component: horizontal tab bar. Keyboard nav (arrow keys, Home/End). Active tab indicator. Controlled + uncontrolled modes. TypeScript interface.
- `<PageShell>` component: slot for tab bar (optional), slot for header/actions, slot for content. Consistent spacing with the app's existing density.
- Both components render live in `/design-system` page with sample usage.
- No `rgba(...)` hardcoded colors — use existing Tailwind semantic tokens.
- Keyboard accessibility: Tab navigation focuses tab bar; arrow keys move within it; Enter/Space activates.

## Research hints

- Design-system living styleguide: `app/frontend/src/routes/_authed/design-system.tsx` (635 LOC — existing demos for reference on style/conventions)
- Design tokens: `app/frontend/tailwind.config.ts`
- Existing components for reference on file conventions: `app/frontend/src/components/data-table.tsx`, `page-header.tsx`, `transactions-view.tsx`
- No `tabs.tsx`, `page-shell.tsx`, or `sidebar.tsx` currently in `src/components/` (confirmed in parent brief)
