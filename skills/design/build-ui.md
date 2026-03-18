---
name: build-ui
description: Designs or builds a page, screen, or component system following the project's strict visual and technical rules.
trigger: When designing a page or screen, building a component system, or reviewing frontend polish and hierarchy.
role: designer, engineer
---

## Purpose

Produces frontend UI — pages, screens, or component systems — that follow the project's strict visual direction, technology constraints, and interaction patterns. Evaluates existing UI against these rules and flags violations.

## Procedure

1. Identify the scope: new page, new component, component system, or review of existing UI.
2. Establish the page or component hierarchy — what is the primary content, what is secondary, what is navigation. Ensure generous whitespace separates these layers.
3. Select or verify the color palette using the tinted neutral color system. Confirm all colors carry the brand hue. Flag any use of pure grey, gradients, or off-brand colors.
4. Select or verify typography. Confirm a single Google Font family is used throughout, with correct weights (700/800 for headings, 400 for body/labels/buttons). Flag any grey text — only black or white text is permitted.
5. Build navigation following the two-tier system: horizontal primary navigation below the header (feature-focused), vertical dropdown secondary navigation from the user email (account/meta). Verify active-page highlighting.
6. Build or verify the header: 100px tall, app name left-aligned and vertically centered, user email right-aligned with 15px top margin and dropdown arrow.
7. Apply interaction patterns: inline expandable sections for small actions, dedicated pages for large forms, inline confirmation for destructive actions, simple loading indicators. Flag any modals, popups, or `confirm()` dialogs.
8. Select icons from approved sources only (Lineicons, Bootstrap Icons, Remix Icon). Verify line-only style, single color, max 120% of adjacent text height, and that every icon accompanies a label.
9. Verify technology compliance: plain semantic HTML5, vanilla CSS in separate `.css` files, vanilla JS (ES6+) in separate `.js` files. Flag any framework, library, or preprocessor usage.
10. Test responsiveness — the layout must work fully on mobile. Verify all breakpoints.
11. Review the output against the full strict rules checklist (see Reference). Flag every violation.

## Reference

### Strict Rules

1. **No gradients anywhere** — solid colors only.
2. **No modals or popups** — use inline expandable sections or dedicated pages.
3. **No grey text** — only black or white text permitted.
4. **No frameworks** — vanilla HTML, CSS, JS only.
5. **Generous whitespace** in all layouts.
6. **Fully responsive** for mobile.
7. **Separate CSS/JS files** for caching.

### Navigation System

**Primary navigation** (feature-focused):
- Horizontal menu below the header.
- Right-aligned (left-aligned if items fill the row).
- Active page highlighted.

**Secondary navigation** (account/meta):
- Vertical dropdown from user's email address (top right).
- Contains: Profile, Team, Billing, Plan, etc.

### Header Structure

100px tall. App name left-aligned, vertically centered. User email right-aligned with 15px top margin and dropdown arrow.

### Typography

- **Approved fonts** (Google Fonts only): Inter, Archivo Narrow, DM Sans, Space Grotesk, Libre Franklin, Source Sans Pro.
- Same font family throughout the entire application.
- Headings: 700 or 800 weight.
- Body, labels, buttons: 400 weight.
- Black text on white backgrounds, white text on colored backgrounds.

### Color System — Tinted Neutrals

All colors carry the brand hue at varying saturation and lightness:

| Variable | Role | Lightness |
|----------|------|-----------|
| `--brand` | Primary brand color | — |
| `--brand-accent` | Very light accent | ~95% |
| `--brand-alt` | Lighter accent | ~80-85% |
| `--brand-alt-accent` | Darker, richer accent | ~40-45% |
| `--contrast` | Almost black with brand tint | ~10-15% |
| `--contrast-accent` | Light grey with brand tint | ~85-90% |
| `--base` | Pure white (#FFFFFF) | 100% |
| `--base-accent` | Medium grey with brand tint | ~45-50% |
| `--tint` | Almost white with subtle brand tint | ~97-99% |
| `--border-base` | Light border with brand tint | — |
| `--border-contrast` | Darker border with brand tint | — |

**Usage**: `--brand` for primary buttons/links, `--contrast` for headings/body text, `--base` for backgrounds, `--tint` for subtle section backgrounds, `--border-base` for table/card borders.

### Icons

- Line icons only — no fill/solid.
- Single color only — no multi-color.
- Max 120% of adjacent text height.
- Approved sources: Lineicons, Bootstrap Icons, Remix Icon.
- Icons accompany labels — never replace them.

### UI Elements

**Buttons**: Subtle rounded corners (4-6px). Primary = `--brand` background + white text. Secondary = white background + `--brand` text + `--brand` border.

**Form inputs**: Clear borders (`--border-base`), `--brand` color focus state, comfortable padding (10-12px).

**Tables**: Clean rows with `--border-base` lines, optional alternating rows with `--tint` background.

### Interaction Patterns

| Scenario | Pattern |
|----------|---------|
| Small actions | Inline expandable sections (not modals) |
| Large forms | Navigate to dedicated page |
| Destructive actions | Inline "Are you sure?" with Yes/No buttons |
| Loading states | Simple text ("Loading...") or CSS-only spinner |
| Confirmation dialogs | Never use `confirm()` — always inline |

### Technology Stack

- Plain semantic HTML5.
- Vanilla CSS in separate `.css` files (no preprocessors, no frameworks).
- Vanilla JavaScript (ES6+) in separate `.js` files (no frameworks, no libraries).
- Start with one global `styles.css`, add page-specific CSS only when needed.

### Review Checklist

When reviewing existing UI, check each item:

- [ ] Layout clarity and navigation hierarchy
- [ ] Component consistency across pages
- [ ] Visual intentionality (not generic framework aesthetics)
- [ ] No gradients anywhere
- [ ] No grey text — only black or white
- [ ] No modals or popups
- [ ] No frameworks, libraries, or preprocessors
- [ ] Responsive design (mobile-first preferred)
- [ ] Color system uses tinted neutrals derived from brand color
- [ ] Icons are line-only, single-color, from approved sources, with labels
- [ ] Typography uses a single approved Google Font with correct weights

## Output

Produce one of the following depending on scope:

- **New page/component**: Complete HTML, CSS, and JS files following all rules above. Include a brief note on navigation placement and color variable usage.
- **Component system**: Set of reusable HTML patterns with corresponding CSS, organized for the project's `styles.css` structure.
- **Review**: A violations report listing each rule broken, the file and location, and the specific fix required. Separate blockers (strict rule violations) from polish items (spacing, alignment, visual refinement).
