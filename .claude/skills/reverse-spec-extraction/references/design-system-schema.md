# design.md — Output Schema

Reference format for the `design.md` artifact produced by extract-ui-walker during Phase 1. Every section is required. Values are discovered from the running prototype — do not invent or assume.

---

## 1. Visual Theme & Atmosphere

Narrative description of the prototype's visual personality. Cover:
- Background treatment (color, texture, warmth/coolness)
- Color family and mood (earthy, corporate, playful, minimal, etc.)
- Typography character (font choice rationale, weight usage patterns)
- Interaction personality (hover behaviors, transitions, animation style)
- Illustration/imagery approach (stock photos, icons, illustrations, none)
- Technical foundation (CSS framework, component library if identifiable)

End with a **Key Characteristics** bullet list (6-8 items) summarizing the defining traits.

## 2. Color Palette & Roles

Extract every color observed in the prototype. Group by role:

### Primary
- Primary text color with hex + description
- High-emphasis / heading color
- Brand accent color(s) + where they appear

### Secondary & Accent
- Secondary accent colors
- Special-purpose colors (focus rings, highlights, badges)

### Surface & Background
- Page background
- Card/container backgrounds (layered from lightest to darkest)
- Hover state backgrounds

### Neutrals & Text
- Text hierarchy colors (primary → secondary → placeholder → disabled)
- Border colors with tint description
- Divider colors

### Semantic & Accent
- Success / error / warning / info (if present)
- Interactive state colors (hover, active, focus)

### Gradient System
- Describe gradient usage or state "no gradients — flat surfaces with [depth method]"

## 3. Typography Rules

### Font Family
- Display / heading font + fallback stack
- Body font + fallback stack (if different)
- Monospace / code font + fallback stack

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | ... | ... | ... | ... | ... | ... |
| Section Heading | ... | ... | ... | ... | ... | ... |
| Feature Heading | ... | ... | ... | ... | ... | ... |
| Card Heading | ... | ... | ... | ... | ... | ... |
| Body | ... | ... | ... | ... | ... | ... |
| Caption | ... | ... | ... | ... | ... | ... |
| Code | ... | ... | ... | ... | ... | ... |

Include every distinct typographic treatment observed. Use actual computed values from the browser, not guesses.

### Principles
- 3-5 bullets describing the typography strategy (weight usage, line-height philosophy, spacing patterns, any unusual conventions)

## 4. Component Stylings

Document every distinct component pattern observed:

### Buttons
- Each variant: background, text color, border-radius, padding, hover/active/disabled states
- Note the hover pattern (color shift, opacity, scale, text color flash, etc.)

### Cards & Containers
- Background, border, radius, shadow, hover behavior
- Variants (bordered, filled, elevated)

### Inputs & Forms
- Default state: background, border, radius, padding, placeholder color
- Focus state: ring color, border change
- Error state (if observed)

### Navigation
- Layout, font treatment, link styling, active/hover states
- Mobile behavior (hamburger, slide-out, collapse)
- CTA button in nav (if present)

### Image Treatment
- Image types used (photos, illustrations, icons, screenshots)
- Aspect ratios, framing, border treatment
- Trust/logo bars

### Additional Components
- Document any other distinct patterns: modals, tooltips, tabs, accordions, badges, alerts, tables, etc.

## 5. Layout Principles

### Spacing System
- Base unit (4px, 8px, etc.)
- Scale values observed
- Section padding ranges
- Component gap ranges

### Grid & Container
- Max content width
- Column patterns observed
- Breakpoints (list all observed)

### Whitespace Philosophy
- 2-3 sentences on how whitespace is used (dense, generous, editorial, etc.)

### Border Radius Scale
- List each radius value and where it's used (small elements, buttons, cards, pills)

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Level 0 | ... | ... |
| Level 1 | ... | ... |
| Level 2 | ... | ... |

### Shadow Philosophy
- How depth is communicated (shadows, borders, surface colors, layering)
- Note deliberate absences (no gradients, no glassmorphism, etc.)

## 7. Do's and Don'ts

### Do
- 6-8 specific, actionable rules for maintaining the design language
- Reference exact colors, sizes, weights — not vague guidance

### Don't
- 6-8 specific anti-patterns that would break the design language
- Explain WHY each is wrong (what it would undermine)

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| ... | ... | ... |

### Touch Targets
- Mobile-specific sizing and spacing adjustments

### Collapsing Strategy
- How each major component type adapts (nav, grids, typography, images)

### Image Behavior
- Responsive image patterns (scale, hide, reflow)

## 9. Agent Prompt Guide

### Quick Color Reference
- 8-10 most-used colors with hex and role name, for quick copy-paste

### Example Component Prompts
- 4-5 natural-language prompts that would reproduce key components using the design system
- Include specific values (colors, sizes, weights, radii)

### Iteration Guide
- 5 checkpoints for verifying a generated component matches the design system
- Focus on the most commonly missed details (background warmth, text color, hover behavior, border tint, overall tone)
