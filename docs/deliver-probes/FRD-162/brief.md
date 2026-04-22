---
issue: FRD-162
issue-rev: 2026-04-22-initial
groomed-at: 2026-04-22T00:00:00Z
trigger: first-groom
type: Feature
design-status: drafted
---

# Outcome

Two net-new design-system primitives — `<Tabs>` and `<PageShell>` — available under `src/components/` and demonstrated live in the `/design-system` styleguide. Primitives match the app's existing Tailwind-token vocabulary and keyboard conventions. No integration into real pages (that is FRD-161c+ scope).

# Acceptance Criteria

- AC1 — Files `app/frontend/src/components/tabs.tsx` and `app/frontend/src/components/page-shell.tsx` exist and export `Tabs` / `PageShell` named React components (plus any supporting sub-parts, e.g. `TabList`, `Tab`, `TabPanels`, `TabPanel`, if the author uses a compound pattern). Verification: `test -f app/frontend/src/components/tabs.tsx && test -f app/frontend/src/components/page-shell.tsx && grep -E 'export (function|const) (Tabs|TabList|Tab|TabPanel)' app/frontend/src/components/tabs.tsx && grep -E 'export (function|const) PageShell' app/frontend/src/components/page-shell.tsx`.
- AC2 — `bun run typecheck` (from `app/frontend/`) passes with zero errors. Verification: `cd app/frontend && bun run typecheck`.
- AC3 — `/design-system` route renders without runtime errors and contains a new section titled `Page Shell` and a new section titled `Tabs` (or equivalently named — must be reachable inside the existing `components` tab of the styleguide, or added as a net-new top-level tab). The demo sections import and use the new components (no inline duplication of the tab logic). Verification: Playwright E2E at `app/e2e/tests/08-design-system.spec.ts` (new file) navigates to `/design-system?dev`, activates the `components` tab (or the newly added `layout` tab if author chose that), asserts headings `Tabs` and `Page Shell` are visible, asserts at least two `[role="tab"]` elements are present inside a `[role="tablist"]`, clicks the second tab, and asserts `aria-selected="true"` moves to it and the associated `[role="tabpanel"]` content swaps.
- AC4 — Keyboard navigation on the `<Tabs>` demo: ArrowRight from tab 1 focuses + activates tab 2; ArrowLeft reverses; Home focuses tab 1; End focuses the last tab; Enter/Space on a focused tab activates it; Tab key moves focus out of the tablist to the active tabpanel content. Verification: Playwright E2E asserts `aria-selected` transitions and `document.activeElement` identity after each key press.
- AC5 — `<Tabs>` supports BOTH controlled (`value` + `onChange`) and uncontrolled (`defaultValue`) modes. Verification: grep that the component's TS interface exposes both shapes — `grep -E '(value\??:|defaultValue\??:|onChange\??:)' app/frontend/src/components/tabs.tsx` returns at least three matches (one per prop).
- AC6 — `<PageShell>` exposes at minimum three named slots: `header` (or renders `<PageHeader>` via a `headerProps` prop), `tabs` (optional — the `<Tabs>` bar, omittable), and `children` (page body content). Verification: `grep -E '(header|tabs|children)\??:' app/frontend/src/components/page-shell.tsx` returns all three; the `/design-system` demo shows the component rendering with and without the `tabs` slot.
- AC7 — No hardcoded `rgba(...)` color literals or hex color literals in either new component file. All colors go through semantic Tailwind tokens (`text-txt`, `text-txt3`, `border-accent`, `bg-surface`, etc. — matching the vocabulary in `tailwind.config.ts`). Verification: `grep -E '(rgba\(|#[0-9a-fA-F]{3,8})' app/frontend/src/components/tabs.tsx app/frontend/src/components/page-shell.tsx` returns nothing.
- AC8 — Active-tab visual affinity matches the existing inline-tab pattern at `design-system.tsx:175-193` — border-bottom active indicator using `border-accent` + `text-txt` for active, `border-transparent` + `text-txt3` / `hover:text-txt2` for inactive, with `focus-visible:ring-2 focus-visible:ring-accent`. Verification: visual inspection in code review; grep-level check that the component uses these class names: `grep -E 'border-accent|focus-visible:ring-accent' app/frontend/src/components/tabs.tsx` returns matches.

# Scope Fence

Always-touch:  app/frontend/src/components/tabs.tsx (create), app/frontend/src/components/page-shell.tsx (create), app/frontend/src/routes/_authed/design-system.tsx (extend — add demo sections for both components; may also refactor the existing inline tabs at lines 175-193 to use the new `<Tabs>` as the canonical dogfood, OR leave them inline — see Rabbit-Hole Patches).
Ask-first:     app/e2e/tests/08-design-system.spec.ts (create — new Playwright spec; requires operator sign-off on spec ordering since 01-07 are dependency-ordered). app/e2e/tests/helpers.ts (may add a small navigate-to-design-system helper if the pattern warrants it).
Never-touch:   app/frontend/tailwind.config.ts, any file under app/backend/, any file under app/frontend/src/routes/_authed/clients/ (per parent FRD-161 constraint — no integration into real pages), any existing file under app/frontend/src/components/ (net-new only), app/frontend/src/routes/_authed.tsx (auth wrapper), migrations, Clerk config.

# Rabbit-Hole Patches

- "Should I refactor the existing inline tab bar in `design-system.tsx:175-193` to use the new `<Tabs>` component?" — YES, as part of the demo-addition work. The existing inline tabs ARE the reference pattern; replacing them with `<Tabs>` is the canonical dogfooding proof that the primitive is a faithful factoring. This is NOT integration into a "real page" — `/design-system` is the styleguide's own page and is explicitly in-scope. Executor must verify post-refactor that the styleguide's own tab behavior (Colors/Typography/Components/Motion switch) still works identically.
- "Do I need to build `<SplitPane>`, `<Sheet>`, or `<CommandPalette>` too?" — NO. Parent brief §FRD-161b explicitly defers these until FRD-161a decides the design direction. Building them now is speculative.
- "Should `<PageShell>` own a sidebar slot?" — NO. Sidebar redesign is FRD-161c (shell revamp). `<PageShell>` is a page-level container, not an app-level shell.
- "Should `<Tabs>` support vertical orientation / scrollable overflow / icon-only mode?" — NO. The only orientation the issue mentions and the only one the design-system's own pattern uses is horizontal with icon+label. YAGNI — ship horizontal; add variants when a consumer needs them.
- "Should `<Tabs>` use a headless-UI library (Radix/Ark/Reach)?" — NO. The codebase has zero headless-UI dependencies (see `app/frontend/package.json`) and builds custom components directly. Introducing Radix now is novelty cost for an already-solved pattern; the existing inline tabs at `design-system.tsx:175-193` are the pattern to follow.
- "Test runner — should I add Vitest/RTL for component-level tests?" — NO. No component test runner is installed. Stage 1 oracle is Playwright E2E against the live `/design-system` page under dev-bypass. Proposing a new test framework is scope creep.
- "Does the `/design-system` demo need its own tab (e.g., `layout`) for these primitives, or should they live inside the existing `components` tab?" — EITHER is acceptable. Executor's judgment. If adding a new top-level tab, extend the `Tab` union type at `design-system.tsx:85`. If placing inside `components` tab, add two new `SectionLabel`-demarcated blocks. Prefer the second for smaller blast-radius unless the new demos are long enough (~100+ LOC each) to warrant their own tab.
- "What component ID / key convention should `<Tabs>` use?" — Use `value: string` (not numeric index). Matches the existing inline pattern (`Tab = 'colors' | 'typography' | ...`) and works well for URL-sync in future consumers.
- "Should `<Tabs>` auto-sync to URL search params (`?tab=foo`)?" — NO. Parent FRD-161d (bank.tsx migration) may want this, but the primitive itself shouldn't own routing. Keep it state-only; consumers that want URL sync compose `useSearch()` from TanStack Router around it.

# Blast-Radius Manifest

Expected to create:
  - app/frontend/src/components/tabs.tsx
  - app/frontend/src/components/page-shell.tsx
  - app/e2e/tests/08-design-system.spec.ts
Expected to change:
  - app/frontend/src/routes/_authed/design-system.tsx (add demo sections; optionally refactor lines 175-193 to dogfood `<Tabs>`; optionally extend `Tab` union on line 85 if adding a new top-level tab)
May change:
  - app/e2e/tests/helpers.ts (small nav helper if warranted; none of the existing helpers reference `/design-system`)
Must not change:
  - app/frontend/tailwind.config.ts (parent constraint)
  - app/backend/** (frontend-only issue)
  - app/frontend/src/routes/_authed/clients/** (no real-page integration)
  - Any existing component under app/frontend/src/components/ other than (net-new only)
  - app/frontend/src/routes/_authed.tsx (auth wrapper)
  - migrations/**, package.json, vite.config.*, tsconfig.*

# Skeleton Position

Single-slice; first (no predecessor primitives). Follows the inline tab-bar pattern at `app/frontend/src/routes/_authed/design-system.tsx:175-193` as the canonical skeleton for `<Tabs>`. Follows the component-file conventions of `app/frontend/src/components/page-header.tsx:1-30` (named export, inline prop interface, no default export, semantic-token className strings) for both `<Tabs>` and `<PageShell>`. Compound-component pattern (optional — executor's judgment) can follow the `DataTable` convention at `data-table.tsx:44-173` (single exported component + internal helpers) OR a compound pattern (`<Tabs>`/`<TabList>`/`<Tab>`/`<TabPanels>`/`<TabPanel>`) if the author judges it yields a cleaner API. Both are acceptable; the AC checks the exports, not the structure.

# Concrete Example

Given a file consuming `<Tabs>`:

```tsx
// Either compound-component style:
<Tabs defaultValue="colors" onChange={(v) => console.log(v)}>
  <TabList>
    <Tab value="colors" icon={Palette}>Colors</Tab>
    <Tab value="typography" icon={Type}>Typography</Tab>
  </TabList>
  <TabPanels>
    <TabPanel value="colors">...colors content...</TabPanel>
    <TabPanel value="typography">...typography content...</TabPanel>
  </TabPanels>
</Tabs>

// OR single-component style:
<Tabs
  defaultValue="colors"
  items={[
    { value: 'colors',     label: 'Colors',     icon: Palette, content: <ColorsSection /> },
    { value: 'typography', label: 'Typography', icon: Type,    content: <TypographySection /> },
  ]}
/>
```

Rendered output (matching `design-system.tsx:175-193` pattern):

```html
<div role="tablist" class="flex gap-1 -mb-px">
  <button role="tab" aria-selected="true"  class="... border-b-2 border-accent text-txt ...">Colors</button>
  <button role="tab" aria-selected="false" class="... border-b-2 border-transparent text-txt3 hover:text-txt2 ...">Typography</button>
</div>
<div role="tabpanel">...colors content...</div>
```

`<PageShell>` usage sketch:

```tsx
<PageShell
  header={<PageHeader icon={Landmark} title="Bank" subtitle="Reconciliation" />}
  tabs={<Tabs defaultValue="reconcile" items={bankTabs} />}
>
  <div>Page body content</div>
</PageShell>
```

Rendered DOM: a vertical stack — header block on top, tab bar below it with bottom border, content area below that with consistent horizontal padding (`mx-auto max-w-5xl px-8` or similar density matching `design-system.tsx:150`).

# Design Rationale

## Alternatives

- **A — Single-component Tabs with `items` array prop** (single `tabs.tsx` exports one `Tabs` component; consumers pass `{ value, label, icon, content }[]`). Cost: low — one component, one interface. Fit: matches the inline pattern at `design-system.tsx:87-92` which already uses a `tabs` array of `{ id, label, Icon }`. Tradeoff: wins simplicity and mirrors existing mental model; loses flexibility for consumers that want to interleave custom JSX between the tab bar and panels (e.g., breadcrumbs between tab bar and panel content).

- **B — Compound-component Tabs** (`<Tabs>`/`<TabList>`/`<Tab>`/`<TabPanels>`/`<TabPanel>` with Context for state). Cost: medium — 5 components + Context + TS types for each. Fit: doesn't match any existing pattern in the codebase (no other compound components in `src/components/`); aligns with Radix/Headless UI conventions if the team ever migrates. Tradeoff: wins composability (breadcrumbs between bar and panels; conditional panel rendering; custom styling per Tab); loses simplicity and introduces a novel pattern.

- **C — Thin wrapper over `@radix-ui/react-tabs`** (install Radix, re-theme with Tailwind). Cost: adds a new dependency (~10kb) + theme-wiring work. Fit: doesn't match the codebase (zero headless-UI deps in `package.json:12-21`). Tradeoff: wins battle-tested keyboard a11y out of the box; loses architectural coherence — introduces Radix for ONE component, which forces a future choice ("do we use Radix everywhere or just here?"). Rejected: novelty cost > solved-problem cost.

## Picked + Reason

Author's judgment between A and B is acceptable — both satisfy the ACs. C is rejected. Pick A (`items` prop) if the executor wants smallest blast-radius and strongest fit with the existing `design-system.tsx:87-92` pattern; pick B (compound) if the executor anticipates that FRD-161d's `bank.tsx` migration will want breadcrumbs or other nodes between the tab bar and panel content. The brief does not force one; the acceptance criteria (AC1–AC8) accept either structure. Reason: neither is strictly better and the codebase has no prior art for compound components to force the decision.

## Deferred

- **URL-search-param sync inside `<Tabs>`** — deferred to consumer-side composition using TanStack Router's `useSearch()`. Keeping the primitive state-only avoids coupling to the router.
- **`<Tabs>` vertical orientation, scrollable overflow, icon-only mode** — YAGNI; add when a consumer needs them.
- **`<SplitPane>`, `<Sheet>`, `<CommandPalette>`** — parent brief §FRD-161b defers these until FRD-161a decides direction.
- **`<PageShell>` sidebar slot** — sidebar redesign is FRD-161c's scope.
- **Component-level tests (Vitest/RTL)** — no runner installed; Stage 1 oracle is Playwright against the live styleguide.

# Failure Modes

- **Dogfooding breaks existing styleguide tabs.** If the executor refactors `design-system.tsx:175-193` to use `<Tabs>` and the refactor introduces a regression, the entire styleguide breaks. Mitigation: AC3 requires the Playwright spec to assert the styleguide's own `components` tab still switches correctly. If the executor chooses NOT to refactor the inline tabs (acceptable), this risk is eliminated but at the cost of a less-convincing proof that `<Tabs>` is a faithful factoring.
- **Keyboard-nav focus management bug.** Tab bars with arrow-key navigation must manage `tabIndex` correctly (active tab `tabIndex={0}`, inactive tabs `tabIndex={-1}`), and must move `document.activeElement` (via `ref.focus()`) on ArrowRight/Left/Home/End. AC4 exercises this explicitly; without it, screen-reader users can't navigate.
- **Controlled/uncontrolled confusion.** Supporting both `value` and `defaultValue` in the same component is a classic React footgun (the "switched from uncontrolled to controlled" warning). The component must detect which mode it's in on first render (`value !== undefined`) and throw if the prop shape changes across renders — or silently pick one mode and document it. AC5 requires the interface; failure mode requires the executor to handle the mode-switch explicitly.
- **TypeScript interface drift between `<Tabs>` and the demo.** If `<Tabs>` interface changes mid-development and the demo isn't updated, `bun run typecheck` fails. AC2 gates this.
- **Dev-bypass auth broken on `/design-system`.** Playwright spec depends on `?dev` query param triggering `DEV_BYPASS` at `_authed.tsx:12`. If this path is broken at SHA 2edac08, AC3 can't verify. Mitigation: the existing e2e suite (`04-dashboard.spec.ts` etc.) uses `storageState: ./tests/.auth/dev-bypass.json` — follow the same pattern.
