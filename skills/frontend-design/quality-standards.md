# Frontend Quality Standards

Full reference for the **Quality Floor** in `SKILL.md`. These rules are the floor, not the design: meeting them does not make a UI distinctive, but missing any of them makes it unprofessional. Apply them silently — do not list them back to the user as features.

Priority order when time is short: Accessibility → Touch & Interaction → Layout & Responsive → Performance → Navigation → Forms → everything else.

---

## 1. Accessibility — WCAG 2.2 AA (CRITICAL)

**Perception**
- Text contrast ≥ 4.5:1; large text (≥24px, or ≥18.66px bold) ≥ 3:1
- Non-text contrast ≥ 3:1 for UI component boundaries, focus indicators, icons that carry meaning, and chart elements (WCAG 1.4.11)
- Never convey information by color alone — pair with icon, text, pattern or position
- `alt` text for meaningful images; `alt=""` for decorative ones
- Content reflows without horizontal scrolling at 320 CSS px wide (400% zoom)

**Operation**
- Every interactive element keyboard-operable; tab order follows visual order
- `:focus-visible` indicator on all interactive elements — never `outline: none` without a visible replacement
- Focused elements are not hidden behind sticky headers/footers or overlays (WCAG 2.4.11) — use `scroll-padding-top` matching the sticky header height
- Target size ≥ 24×24 CSS px (WCAG 2.5.8 minimum); 44×44px recommended for primary touch targets
- Any drag interaction (reorder, slider, map pan) has a single-pointer alternative (WCAG 2.5.7)
- Skip-to-content link as the first focusable element

**Understanding**
- Help mechanisms (contact, chat, FAQ link) appear in the same relative place on every page (WCAG 3.2.6)
- Don't make users re-enter information they already provided in the same flow (WCAG 3.3.7)
- Authentication without cognitive tests: allow paste and password managers; no "retype this code from memory" (WCAG 3.3.8)

**Structure**
- Semantic HTML: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<button>`, `<a href>` — never `<div onclick>`
- One `h1` per page; sequential heading levels, no skips
- `aria-label` on icon-only buttons and links; `aria-live="polite"` for toasts and async status
- `@media (prefers-reduced-motion: reduce)` guard on every non-essential animation and transition
- Prefer native `<dialog>`, `popover`, `<details>` and form controls; when building custom widgets, follow the WAI-ARIA Authoring Practices pattern (or use Radix / React Aria / Ark UI)

## 2. Touch & Interaction (CRITICAL)

- 8px+ gap between adjacent touch targets
- Never rely on hover alone for primary interactions — hover is an enhancement (Tailwind v4's `hover:` already only applies on hover-capable devices)
- Visual feedback within 100ms of a tap or click (pressed state, ripple, or immediate state change)
- Async buttons: disable during the request, show inline progress, prevent double-submit
- Respect safe areas on notched devices: `padding: env(safe-area-inset-*)` with `viewport-fit=cover`
- `cursor: pointer` on clickable non-link elements (Tailwind v4 resets buttons to `cursor: default`)

## 3. Performance (HIGH)

Targets (Core Web Vitals, "good"): LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1.

- Images: WebP/AVIF, responsive `srcset`/`sizes`, explicit `width`/`height` or `aspect-ratio`
- `loading="lazy"` on below-fold images; `fetchpriority="high"` on the LCP image — never lazy-load it
- Fonts: `font-display: swap` (or `optional`), preload only the one or two critical files, subset when self-hosting, prefer one variable file over many static weights
- Metric-matched fallback `@font-face` (`size-adjust`, `ascent-override`) to avoid swap-induced layout shift
- Code-split non-critical routes and heavy components (dynamic import)
- Reserve space for async content; skeletons for anything that takes > 300ms
- Virtualize lists with 50+ rows (TanStack Virtual)
- Keep long tasks off the main thread during interaction; debounce expensive input handlers
- `content-visibility: auto` for long below-fold sections; `will-change` only temporarily, never globally

## 4. Style Consistency (HIGH)

- One SVG icon set across the product (Lucide, Phosphor, Heroicons, Tabler) — never emoji as icons
- Consistent elevation, radius and z-index scales (see §6)
- One primary CTA per view; secondary actions visually subordinate
- Effects (shadow, blur, radius, border) all follow the chosen design direction
- Avoid card spam: group with spacing and typography before reaching for bordered containers
- Hierarchy never relies on color alone — use size, weight, spacing and position

## 5. Layout & Responsive (HIGH)

- Mobile-first: base styles for small screens, `min-width` queries scale up
- `<meta name="viewport" content="width=device-width, initial-scale=1">` — never disable zoom
- Breakpoints from the framework (Tailwind: 640/768/1024/1280/1536) or from where the content breaks; **test viewports** at 375 / 768 / 1024 / 1440
- Container queries for components that live in slots of different widths
- ≥ 16px body text on mobile (also prevents iOS input auto-zoom)
- Line length 45–75ch on desktop; 35–60ch on mobile
- 4px/8px spacing rhythm from a token scale
- `max-width` container for reading content on wide screens
- `min-h-dvh` / `100dvh` instead of `100vh`
- Adapt hierarchy per breakpoint (sidebar → bottom sheet / drawer), don't just stack columns

## 6. Design Tokens (MEDIUM)

Define as CSS custom properties (or Tailwind v4 `@theme`), and use only tokens in components:

- **Color** — semantic names (`--color-surface`, `--color-surface-raised`, `--color-text`, `--color-text-muted`, `--color-action`, `--color-danger`, `--color-success`, `--color-warning`, `--color-focus`); authored in OKLCH
- **Type** — family roles (`--font-display`, `--font-body`, `--font-mono` if needed) and a modular scale with `clamp()` for fluid sizes
- **Spacing** — a 4px-based scale
- **Radius** — tied to the direction: sharp (0–2px) for brutalist/editorial, medium (6–10px) for product UI, large (16–24px) for soft/playful. Nested radius = outer radius − padding, so inner corners stay concentric.
- **Elevation** — shadow scale that fits the style (none for flat; layered low-opacity shadows tinted with the surface hue for depth; lighter surfaces instead of shadows in dark mode)
- **Z-index** — named layers: base 0, raised 10, sticky 20, overlay 40, modal 50, toast 60 (native `<dialog>`/`popover` use the top layer and need none)

## 7. Dark Mode (when the product calls for it)

Decide first whether it belongs. Content-heavy, trust-sensitive and general-audience products are often better light-first; dev tools, media and long-session monitoring tools often benefit from dark.

- Tokens per theme; `color-scheme: light dark` on `:root` so native controls and scrollbars follow
- System preference by default (`prefers-color-scheme`), user override stored in `localStorage`
- Apply the stored choice with a tiny inline `<head>` script **before first paint** to avoid a flash of the wrong theme
- Tailwind v4 class/attribute toggle needs `@custom-variant dark (...)` — see `tailwind-v4.md`
- Dark ≠ inverted: use lighter, desaturated tonal variants; avoid pure `#000` backgrounds behind long text unless it's an OLED-first product
- Shadows disappear on dark surfaces — express elevation with lighter surface tones and subtle borders
- Re-check every semantic color (danger, success, warning, focus) against the dark surfaces

## 8. Animation (MEDIUM)

- Micro-interactions 150–300ms; larger transitions ≤ 400ms; nothing user-blocking above 500ms
- Animate only `transform` and `opacity` (and `filter` sparingly) — never `width`, `height`, `top`, `left`
- `ease-out` (or a spring) for entering, `ease-in` for exiting; exits ~60–70% of the enter duration
- Stagger list entrances 30–50ms per item, capped (don't stagger 40 rows)
- All animation interruptible by user input
- At most one or two things moving at once in a view
- `prefers-reduced-motion: reduce` → remove motion or replace it with an opacity change

## 9. Forms & Feedback (MEDIUM)

- A visible `<label>` for every input — never placeholder-only
- Errors inline below the field (plus a summary at the top for long forms), linked via `aria-describedby`
- Validate on blur or submit, not on every keystroke; clear an error as soon as it's fixed
- Required fields: `required` attribute + visible indicator; mark optional fields instead if most are required
- Persistent helper text below complex inputs (not tooltip-only)
- Correct `type`, `inputmode` and `autocomplete` on every input (email, tel, one-time-code, new-password…)
- Disabled controls: semantic `disabled`, reduced opacity, `cursor: not-allowed`; explain why when it isn't obvious
- Progressive disclosure for advanced options
- Confirm destructive actions by naming them ("Delete 3 files permanently?"); offer undo where possible
- Auto-save long forms; warn before navigating away from unsaved changes
- Toasts: 3–5s auto-dismiss for success, persistent for errors, `aria-live="polite"`

**Micro-copy**
- Buttons: specific verbs ("Save changes", "Send invite") — never "Submit", "OK", "Click here"
- Errors: cause + fix ("That email is already registered — sign in instead")
- Empty states: purpose + action ("No projects yet. Create your first project.")
- Loading text for waits over ~3s ("Importing 1,200 contacts…")
- Success: confirm what happened ("Project created"), using the same verb as the action
- Placeholders: realistic examples ("jane@company.com"), never instructions

## 10. Navigation (HIGH)

- Current location visibly marked in navigation (`aria-current="page"`)
- Every key screen reachable by URL / deep link; filters and tabs reflected in the URL where useful
- Back navigation restores scroll position and filter/input state
- Mobile bottom nav: max 5 items, icon + text label
- ≥ 1024px: sidebar for many sections; small screens: bottom/top nav or drawer
- Don't mix tabs, sidebar and bottom nav at the same hierarchy level
- Modals and sheets: obvious close control, `Esc` closes, focus returns to the trigger; swipe-down on mobile sheets
- On client-side route change, move focus to the main heading/region and announce the new page

## 11. Charts & Data Visualization (LOW)

- Chart type follows the question: trend → line, comparison → bar, part-to-whole → stacked bar (pie/donut only for ≤ 5 categories)
- Accessible categorical palette with pattern/marker/label supplements; direct labels beat legends when space allows
- Legend (if needed) visible next to the chart, not below the fold
- Exact values via tooltip on hover/focus/tap; keyboard-navigable data points for interactive charts
- Text summary (`aria-label` or caption) stating the key insight, plus a data table alternative
- Simplify on small screens (fewer ticks, horizontal bars)
- Tabular numerals in axes and tables; skeleton while data loads

## 12. Frontend-Backend Integration

- **Fetching**: show loading immediately; use a cache + revalidation layer (TanStack Query, SWR, or the framework's loader/RSC data layer)
- **Optimistic updates** for user-initiated mutations (toggle, delete, reorder) with rollback and an error toast on failure
- **Error boundaries** per route segment / panel so one failed request doesn't blank the page
- **Auth**: redirect to the originally requested page after login; show auth state in the nav; refresh tokens silently and prompt re-login only when unavoidable
- **Real-time**: WebSocket or SSE with reconnect + backoff, a visible connection status, and a polling fallback
- **Forms**: disable submit while pending, inline progress, then a success confirmation or field-level errors from the server
- **Lists**: show totals ("1–25 of 342"); cursor-based pagination for live data; preserve scroll on back-navigation
