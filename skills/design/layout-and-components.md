# Skill: Layout And Components

## Use When

- designing a page or screen
- building a component system
- reviewing frontend polish and hierarchy

## Guidance

- keep hierarchy, spacing, and typography coherent
- prefer clear interactions over modal-heavy flows
- make interfaces feel intentional rather than generic
- use a strong visual direction instead of default framework aesthetics
- match an exemplar only when explicitly requested

## Strict Rules

1. No gradients anywhere — solid colors only
2. No modals or popups — inline expandable sections or dedicated pages
3. No grey text — only black or white
4. No frameworks — vanilla HTML, CSS, JS
5. Generous whitespace in all layouts
6. Fully responsive for mobile
7. Separate CSS/JS files for caching

## Navigation System

**Primary navigation** (feature-focused):
- Horizontal menu below the header
- Right-aligned (left-aligned if items fill the row)
- Active page highlighted

**Secondary navigation** (account/meta):
- Vertical dropdown from user's email address (top right)
- Contains: Profile, Team, Billing, Plan, etc.

## Header Structure

100px tall. App name left-aligned, vertically centered. User email right-aligned with 15px top margin and dropdown arrow.

## Typography

- Google Fonts only: Inter, Archivo Narrow, DM Sans, Space Grotesk, Libre Franklin, Source Sans Pro
- Same font family throughout entire application
- Headings: 700 or 800 weight
- Body, labels, buttons: 400 weight
- Black text on white backgrounds, white text on colored backgrounds

## Color System — Tinted Neutrals

All colors carry the brand hue at varying saturation and lightness:
- `--brand` — primary brand color
- `--brand-accent` — very light, ~95% lightness
- `--brand-alt` — lighter accent, ~80-85% lightness
- `--brand-alt-accent` — darker, richer, ~40-45% lightness
- `--contrast` — almost black with brand tint, ~10-15% lightness
- `--contrast-accent` — light grey with brand tint, ~85-90% lightness
- `--base` — pure white #FFFFFF
- `--base-accent` — medium grey with brand tint, ~45-50% lightness
- `--tint` — almost white with subtle brand tint, ~97-99% lightness
- `--border-base` — light border with brand tint
- `--border-contrast` — darker border with brand tint

**Usage**: brand for primary buttons/links, contrast for headings/body text, base for backgrounds, tint for subtle section backgrounds, border-base for table/card borders.

## Icons

- Line icons only — no fill/solid
- Single color only — no multi-color
- Max 120% of adjacent text height
- Approved sources: Lineicons, Bootstrap Icons, Remix Icon
- Icons accompany labels, never replace them

## UI Elements

**Buttons**: subtle rounded corners (4-6px), primary = brand background + white text, secondary = white background + brand text + brand border

**Form inputs**: clear borders (border-base), brand color focus state, comfortable padding (10-12px)

**Tables**: clean rows with border-base lines, optional alternating rows with tint background

## Interaction Patterns

- Small actions → inline expandable sections (not modals)
- Large forms → navigate to dedicated page
- Destructive actions → inline "Are you sure?" with Yes/No buttons
- Loading → simple text ("Loading...") or CSS-only spinner
- Never use `confirm()` dialogs

## Technology Stack

- Plain semantic HTML5
- Vanilla CSS in separate `.css` files (no preprocessors, no frameworks)
- Vanilla JavaScript (ES6+) in separate `.js` files (no frameworks, no libraries)
- Start with one global `styles.css`, add page-specific CSS only when needed

## Review Focus

- layout clarity and navigation hierarchy
- component consistency across pages
- visual intentionality (not generic framework aesthetics)
- strict rules compliance (no gradients, no grey text, no modals, no frameworks)
- responsive design (mobile-first preferred)
- color system consistency (tinted neutrals from brand color)
