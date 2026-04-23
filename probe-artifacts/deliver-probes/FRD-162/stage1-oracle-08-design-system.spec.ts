import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * FRD-162 Stage 1 oracle — locks in observable invariants for the
 * net-new <Tabs> and <PageShell> primitives demoed in /design-system.
 *
 * Against unmodified source at SHA 2edac08, these tests MUST fail
 * because:
 *   - app/frontend/src/components/tabs.tsx doesn't exist yet
 *   - app/frontend/src/components/page-shell.tsx doesn't exist yet
 *   - The /design-system page has no "Tabs" / "Page Shell" demo sections
 *
 * AC coverage (Playwright-testable subset only):
 *   - AC3 — demo sections exist, tablist + ≥2 tabs render, click swaps
 *           aria-selected + visible tabpanel.
 *   - AC4 — keyboard nav: ArrowRight/Left, Home/End, Enter/Space, Tab.
 *
 * Intentionally skipped (source-level, verified via grep/typecheck in Stage 2):
 *   AC1 (file existence), AC2 (typecheck), AC5 (prop interface shape),
 *   AC6 (PageShell slot interface), AC7 (no hex/rgba literals),
 *   AC8 (Tailwind class vocabulary).
 */

const DESIGN_SYSTEM_URL = '/design-system?dev'

/**
 * Navigate to the /design-system styleguide with dev-bypass auth live.
 * The storageState from global-setup already has dev-bypass enabled.
 */
async function goToDesignSystem(page: Page) {
  await page.goto(DESIGN_SYSTEM_URL)
  // Wait for the styleguide to mount — the "Calibrax Grid" header is
  // stable prior art (design-system.tsx:154).
  await expect(page.locator('text=Calibrax Grid').first()).toBeVisible({ timeout: 10_000 })
}

/**
 * Locate the NEW <Tabs> demo tablist — the one inside the "Tabs" section.
 * Distinguishes from the pre-existing top-level styleguide tablist by
 * scoping to a region whose heading reads "Tabs".
 *
 * The brief (Rabbit-Hole Patches) allows either:
 *   - a new top-level "Layout" tab that contains the demo, OR
 *   - two new SectionLabel blocks inside the existing "Components" tab.
 * Either way, a heading with exact text "Tabs" must be present, and the
 * tablist demo must live somewhere under that heading's section.
 */
function demoTabsSection(page: Page): Locator {
  // Match a heading-like element (heading role OR SectionLabel span) whose
  // exact text is "Tabs" — not "Tab" substrings like "Typography" or
  // "Tabular Data Pattern".
  return page.locator(
    'h1, h2, h3, h4, h5, h6, span, div'
  ).filter({ hasText: /^Tabs$/ }).first()
}

function demoPageShellSection(page: Page): Locator {
  return page.locator(
    'h1, h2, h3, h4, h5, h6, span, div'
  ).filter({ hasText: /^Page Shell$/i }).first()
}

/**
 * Resolve the <Tabs> demo tablist. Strategy:
 *   1. Find the "Tabs" heading.
 *   2. Walk up to its containing section (closest div with role or section).
 *   3. Find the [role="tablist"] within that section.
 *
 * If the executor places the demo in the "Components" tab, we first activate
 * that tab on the page-level tablist (design-system.tsx:175-193). Since the
 * brief allows EITHER placement, we try both: activate Components tab, then
 * fall back to a Layout tab if present.
 */
async function openDemoTab(page: Page) {
  // The page-level styleguide tablist is the first tablist on the page
  // (design-system.tsx:175). Try activating the new "Layout" tab if the
  // executor added one; otherwise fall back to "Components" which is
  // pre-existing.
  const layoutTab = page.getByRole('tab', { name: /^Layout$/ })
  const componentsTab = page.getByRole('tab', { name: /^Components$/ })

  if (await layoutTab.isVisible({ timeout: 1500 }).catch(() => false)) {
    await layoutTab.click()
  } else if (await componentsTab.isVisible({ timeout: 1500 }).catch(() => false)) {
    await componentsTab.click()
  }
  // Small settle after tab-switch re-render.
  await page.waitForTimeout(150)
}

/**
 * Get the tablist that belongs to the NEW <Tabs> demo — i.e. one that is a
 * descendant of the section whose heading is "Tabs". We resolve this by
 * locating the "Tabs" heading, climbing to the nearest common ancestor,
 * and querying for a tablist within.
 *
 * Falls back to a naive approach: among all tablists on the page, pick the
 * one that is NOT the page-level styleguide tablist (the first one, which
 * has tabs labelled Colors/Typography/Components/Motion).
 */
async function getDemoTablist(page: Page): Promise<Locator> {
  // Find all tablists, exclude the pre-existing page-level one.
  const allTablists = page.getByRole('tablist')
  const count = await allTablists.count()

  for (let i = 0; i < count; i++) {
    const tl = allTablists.nth(i)
    const tabNames = await tl.getByRole('tab').allTextContents()
    const joined = tabNames.join('|').toLowerCase()
    // Page-level styleguide tablist has Colors/Typography/Components/Motion.
    // Skip it — we want the <Tabs> DEMO, which has different labels.
    const isPageLevelStyleguideTabs =
      joined.includes('colors') &&
      joined.includes('typography') &&
      joined.includes('components') &&
      joined.includes('motion')
    if (!isPageLevelStyleguideTabs) {
      return tl
    }
  }
  // No non-styleguide tablist found — return the last one for a clean
  // failure message downstream.
  return allTablists.last()
}

test.describe('FRD-162 — /design-system primitives (AC3)', () => {
  test.beforeEach(async ({ page }) => {
    await goToDesignSystem(page)
    await openDemoTab(page)
  })

  test('renders a section titled "Tabs"', async ({ page }) => {
    await expect(demoTabsSection(page)).toBeVisible({ timeout: 10_000 })
  })

  test('renders a section titled "Page Shell"', async ({ page }) => {
    await expect(demoPageShellSection(page)).toBeVisible({ timeout: 10_000 })
  })

  test('Tabs demo has a [role="tablist"] with at least 2 [role="tab"]s', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    await expect(tablist).toBeVisible({ timeout: 10_000 })
    const tabs = tablist.getByRole('tab')
    expect(await tabs.count()).toBeGreaterThanOrEqual(2)
  })

  test('clicking second tab moves aria-selected and swaps the visible tabpanel', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const firstTab = tabs.nth(0)
    const secondTab = tabs.nth(1)

    // Capture initial state: first tab should be selected, some tabpanel visible.
    await expect(firstTab).toHaveAttribute('aria-selected', 'true')

    // Record the text of the currently visible tabpanel to assert content swap.
    const firstPanel = page.getByRole('tabpanel').first()
    await expect(firstPanel).toBeVisible()
    const firstPanelText = (await firstPanel.textContent()) ?? ''

    // Click second tab.
    await secondTab.click()

    // aria-selected moves.
    await expect(secondTab).toHaveAttribute('aria-selected', 'true')
    await expect(firstTab).toHaveAttribute('aria-selected', 'false')

    // Visible tabpanel content changes.
    const nowVisiblePanel = page.getByRole('tabpanel').first()
    await expect(nowVisiblePanel).toBeVisible()
    const nowText = (await nowVisiblePanel.textContent()) ?? ''
    expect(nowText).not.toEqual(firstPanelText)
  })
})

test.describe('FRD-162 — <Tabs> keyboard navigation (AC4)', () => {
  test.beforeEach(async ({ page }) => {
    await goToDesignSystem(page)
    await openDemoTab(page)
  })

  test('ArrowRight from tab 1 moves activation to tab 2', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const first = tabs.nth(0)
    const second = tabs.nth(1)

    await first.focus()
    await expect(first).toBeFocused()
    await page.keyboard.press('ArrowRight')

    await expect(second).toHaveAttribute('aria-selected', 'true')
    await expect(second).toBeFocused()
  })

  test('ArrowLeft from tab 2 moves activation back to tab 1', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const first = tabs.nth(0)
    const second = tabs.nth(1)

    await second.click()
    await expect(second).toHaveAttribute('aria-selected', 'true')

    await second.focus()
    await page.keyboard.press('ArrowLeft')

    await expect(first).toHaveAttribute('aria-selected', 'true')
    await expect(first).toBeFocused()
  })

  test('Home jumps to first tab, End jumps to last tab', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const count = await tabs.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const first = tabs.nth(0)
    const last = tabs.nth(count - 1)

    // Start somewhere NOT at first.
    await last.focus()

    await page.keyboard.press('Home')
    await expect(first).toHaveAttribute('aria-selected', 'true')
    await expect(first).toBeFocused()

    await page.keyboard.press('End')
    await expect(last).toHaveAttribute('aria-selected', 'true')
    await expect(last).toBeFocused()
  })

  test('Enter activates focused tab', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const first = tabs.nth(0)
    const second = tabs.nth(1)

    // Start at first; move focus to second WITHOUT auto-activating by
    // using click+keyboard seqencing: we click first so it's both focused
    // and selected, then Tab-like focus move via JS focus() on second.
    await first.click()
    await expect(first).toHaveAttribute('aria-selected', 'true')

    // Focus second without arrow (which some implementations couple to
    // activation). If the Tabs impl uses manual activation (tab key within
    // tablist), pressing Enter should activate. If it uses auto-activation
    // (arrow already selects), Enter on a selected tab is a no-op but still
    // leaves it selected — the assertion holds either way.
    await second.focus()
    await page.keyboard.press('Enter')
    await expect(second).toHaveAttribute('aria-selected', 'true')
  })

  test('Space activates focused tab', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const first = tabs.nth(0)
    const second = tabs.nth(1)

    await first.click()
    await expect(first).toHaveAttribute('aria-selected', 'true')

    await second.focus()
    await page.keyboard.press('Space')
    await expect(second).toHaveAttribute('aria-selected', 'true')
  })

  test('Tab key moves focus out of the tablist', async ({ page }) => {
    const tablist = await getDemoTablist(page)
    const tabs = tablist.getByRole('tab')
    const first = tabs.nth(0)

    await first.focus()
    await expect(first).toBeFocused()

    await page.keyboard.press('Tab')

    // After Tab, active element should no longer be any tab in the tablist.
    const activeIsStillTab = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      return el?.getAttribute('role') === 'tab'
    })
    expect(activeIsStillTab).toBe(false)
  })
})
