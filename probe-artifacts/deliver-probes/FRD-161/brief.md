---
issue: FRD-161
issue-rev: 2026-04-22-initial
groomed-at: 2026-04-22T00:00:00Z
trigger: first-groom
type: Feature
design-status: need-info
---

# Outcome

Redesign Gridfin's UI/UX to reduce per-page density and adopt a modern accounting-app layout pattern (Xero/QuickBooks-style tabs-within-function is the issue's reference, but NOT yet operator-committed). This brief stops at decomposition — a unified implementable brief is not appropriate and would force premature commitments.

# Proposed decomposition

The issue is multi-slice. It cannot be groomed as one brief because (1) the design direction itself is an open decision that branches the file tree, (2) per-page migrations are mutually independent units of work, and (3) the shell/layout substrate must exist before per-page work can target it. Proposed split (operator to create as separate Linear issues and re-dispatch per sub-issue):

### FRD-161a — Design direction decision (precursor, non-code)

**Scope.** Pick the navigation pattern the app will converge on. Options include (but are not limited to):
- **Tabs-within-function** (issue's reference): sidebar is function-level nav (AR, AP, Bank, GL, Analytics); each function screen hosts tabs for sub-contexts (e.g., Bank → Reconcile | Statements | Rules | Activity).
- **Split routes**: the same subdivision, but as distinct routes under `/clients/$clientId/bank/reconcile`, `/bank/statements`, etc. — no tab UI, just routing. Better for deep linking and browser back-button; worse for cross-tab context retention.
- **Progressive disclosure on a single canvas**: keep one route per function, split dense canvases into collapsible panels / master-detail instead of tabs. Lower blast-radius but leaves density problem partially unsolved.
- **Command palette + minimal chrome**: de-emphasize nav altogether, promote keyboard-first navigation. High novelty, high risk — only if operator wants a distinctive direction.

**Deliverable.** A written design-direction decision (1–2 pages) citing which pattern, why, and which benchmark (Xero/QuickBooks/Notion/Linear/etc.) it's modeled on. Includes a component inventory promise (what primitives — Tabs, SplitPane, Sheet, CommandPalette — the design system needs to gain). No code.

**Why precursor.** Every downstream sub-issue's blast-radius depends on this choice. Tabs-within-function changes per-function routes; split-routes changes the router tree; progressive-disclosure changes the page bodies only.

**Open questions for the operator.**
1. Is tabs-within-function a committed direction, or is it one reference among several?
2. What's the target density reduction — is there a measurable criterion (e.g., "max 7 primary UI elements above the fold per screen")?
3. Mobile scope: is Gridfin expected to work on tablet/mobile, or is desktop-only acceptable? (Current app appears desktop-only; tabs-in-function collapses poorly on mobile without a dedicated tablet pattern.)
4. Is the sidebar's current 5-group taxonomy (Overview / Design / Deploy / Manage / Configure) staying, or is it part of the rethink? Current groupings `Design` and `Deploy` contain only disabled placeholders — the taxonomy reads like a product-roadmap map, not a user mental model.

### FRD-161b — Design-system extensions (foundation)

**Scope.** Add the primitives the direction from 161a requires. Based on the issue's reference to tabs-per-function, likely at minimum:
- `<Tabs>` primitive (horizontal tab bar + keyboard nav + active-state animation) — currently not present in `src/components/`.
- `<PageShell>` / sub-nav slot — a reusable container that renders a page's tab bar (or sub-route switcher) and a consistent header/actions area.
- Possibly: `<SplitPane>`, `<Sheet>` (side panel), `<CommandPalette>`, depending on 161a's pick.

**Deliverable.** New components under `src/components/` + live demos added to `/design-system`. No integration into real pages yet — that's 161c+.

**Blast-radius preview.** Expected to create: `src/components/tabs.tsx`, `src/components/page-shell.tsx`, possibly others. Expected to change: `src/routes/_authed/design-system.tsx` (add demo sections). Must not change: `tailwind.config.ts` (operator ruled it out of scope), existing page components.

### FRD-161c — Shell / sidebar redesign (shared substrate)

**Scope.** If 161a's pick changes the shell (e.g., sidebar taxonomy, topbar density, client-switcher placement, responsive behavior), revamp `src/routes/_authed/clients/$clientId.tsx` accordingly. Sidebar rendering currently lives inline in that file (lines 127–292, ~220-line shell); there's no `<Sidebar>` component yet.

**Deliverable.** Shell-only changes. No per-function page body changes.

**Depends on.** 161a (direction), 161b (any new shell primitives).

### FRD-161d…N — Per-function migrations (one issue per function)

**Scope.** For each dense function screen, migrate to the new pattern. One sub-issue per function, prioritized by density:

| Sub-issue | File | Current LOC | Density signal |
|---|---|---|---|
| 161d | `bank.tsx` | 3,836 | Highest priority — monolithic, likely contains reconciliation, statements, rules, transactions in one canvas |
| 161e | `context.tsx` | 1,816 | Business Context screen |
| 161f | `gl.tsx` | 1,545 | General Ledger |
| 161g | `gdrive.tsx` | 947 | |
| 161h | `inbox.tsx` | 891 | |
| 161i | `analytics.tsx` | 886 | |
| 161j | `gl-compare.tsx` | 587 | Possibly merges into 161f as a tab |
| 161k | `index.tsx` (client dashboard) | 556 | |

Stubs (`ar.tsx`, `ap.tsx`, `ar-compare.tsx`, `ap-compare.tsx` — all 6–9 LOC) are out of scope for migration since they're already trivial; 161a's decision may redefine what they should become.

**Depends on.** 161a, 161b, 161c in that order. 161d is the first full migration and should be treated as tracer-bullet (convention-setter) — it defines the per-function pattern that 161e–161k follow.

**Per-sub-issue shape.** Each per-function migration sub-issue should be a normal Feature brief: cite the tab-layout pattern established by 161d (file:line), list expected-to-change files, list acceptance criteria observable via `curl` or Playwright (e.g., "GET `/clients/$id/bank` renders 4 tabs: Reconcile, Statements, Rules, Activity; default tab = Reconcile; deep-link `?tab=rules` opens Rules").

### FRD-161-later (optional / deferred)

- Token consolidation — retiring legacy aliases (`green`/`orange`/`red`/`purple`) in favor of semantic tokens (`success`/`warning`/`destructive`/`navy`). Explicitly out of this issue's scope per operator constraint ("existing `/design-system` design-token definitions in `tailwind.config.ts` — those are the foundation, not in scope").
- Hard-coded `rgba()` audit — same rationale as above; separate cleanup issue.
- Mobile/responsive pass — only if 161a's direction commits to it.

# Why this can't be single-sliced

1. **The design direction decision (161a) branches the blast-radius tree.** Tabs-within-function, split-routes, and progressive-disclosure each imply different files touched, different primitives needed, and different acceptance criteria. A unified brief would either pre-commit on the operator's behalf (forbidden per issue constraint: "Design direction … is not yet committed by the operator; the groom must NOT assume it") or list every option, which collapses back to a decomposition anyway.

2. **The per-function migrations are independent surfaces.** `bank.tsx` (3,836 LOC) and `gl.tsx` (1,545 LOC) share no logic. A sub-issue touching both would have to enumerate tabs for each independently — there is no shared acceptance criterion that proves both work. One sub-issue per function is the natural decomposition.

3. **Shell and content must sequence.** 161c changes `$clientId.tsx`; 161d–161k change per-function files. They can be done in either order only if the shell doesn't change — and per 161a's open questions (sidebar taxonomy, mobile behavior), it probably does.

4. **Scope-creep risk.** A unified "redesign the app" brief invites the executor to silently expand into token consolidation, mobile, accessibility, and performance passes — all of which the operator explicitly ruled out ("What must NOT change outside this issue's scope"). Decomposition creates explicit fences.

# What each sub-issue would cover (one-line scopes)

- **161a** — Design direction decision. Non-code. Output: written decision + primitive inventory.
- **161b** — Add design-system primitives the decision requires. Code, but isolated to `src/components/` + `design-system.tsx`.
- **161c** — Revamp shell (`$clientId.tsx`) to match the new direction. Code, narrow blast-radius.
- **161d** — Migrate `bank.tsx` to the new pattern. Tracer-bullet; sets per-function convention.
- **161e–161k** — Migrate remaining functions, each following 161d's established pattern.

# Skill invocation notes (procedural)

Three design skills are installed at `app/.agents/skills/` (`critique`, `shape`, `audit`). None were invoked, because:

- All three declare `MANDATORY PREPARATION: Invoke /impeccable … If no design context exists yet, you MUST run /impeccable teach first.` The `teach-impeccable` skill was intentionally NOT installed (per dispatch brief).
- Their purposes don't fit the pre-groomer role: `shape` runs a discovery interview with the operator (I don't interact with the operator mid-groom); `critique` evaluates a live UI against Nielsen heuristics (out of scope for brief production); `audit` runs technical a11y/perf checks on source (useful for a different issue, not for decomposition of an open-ended redesign).
- The decomposition decision does not depend on skill output. It depends on scope-classification (multi-slice vs. single-slice), which is determined by the issue's own open questions and the file-density inventory — both collected via Read/Grep/LOC count.

If the operator wants skill-grounded output, the appropriate next step is:
- Install `teach-impeccable` and invoke `shape` during FRD-161a to produce the design-direction decision (that skill's purpose: "Plan the UX and UI for a feature before writing code").
- Invoke `critique` on the current app as input to FRD-161a (evidence-gathering for why the redesign is needed).
- Invoke `audit` on FRD-161d's output as a gate before 161e-161k propagate the pattern.

# Evidence cited

- App shell: `/Users/shyangcalibrax/Documents/Projects/autoship-deliver-0.4/app/frontend/src/routes/_authed/clients/$clientId.tsx:127-292` — topbar + sidebar rendered inline here, not in `_authed.tsx` (`_authed.tsx` is auth boilerplate only, no chrome).
- Sidebar nav inventory: same file, `getNavLinks()` at lines 34–51; groups at line 58.
- Density ranking: `wc -l` across `_authed/clients/$clientId/*.tsx`:
  - `bank.tsx` 3,836 · `context.tsx` 1,816 · `gl.tsx` 1,545 · `gdrive.tsx` 947 · `inbox.tsx` 891 · `analytics.tsx` 886 · `gl-compare.tsx` 587 · `index.tsx` 556.
  - Stubs: `ar.tsx`, `ap.tsx`, `ar-compare.tsx`, `ap-compare.tsx` (6–9 LOC each).
- Design tokens: `/Users/shyangcalibrax/Documents/Projects/autoship-deliver-0.4/app/frontend/tailwind.config.ts` (67 LOC) — semantic tokens + legacy aliases coexist as noted in issue.
- Living styleguide: `/Users/shyangcalibrax/Documents/Projects/autoship-deliver-0.4/app/frontend/src/routes/_authed/design-system.tsx` (635 LOC) — 161b's expected demo target.
- Existing components: `src/components/` contains `data-table.tsx`, `page-header.tsx`, `transactions-view.tsx`, `subledger-compare.tsx`, etc. No `tabs.tsx`, no `page-shell.tsx`, no `sidebar.tsx` — confirms 161b adds new primitives rather than modifying existing ones.
