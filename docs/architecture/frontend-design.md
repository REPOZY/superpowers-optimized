# Frontend Design Skill

How the frontend-design skill works and what to expect when you ask the AI to build a UI.

## What It Does

The frontend-design skill activates whenever you ask the AI to build or change a frontend — a website, dashboard, landing page, admin panel, or any UI component. It has two jobs:

1. **Make the design specific to your product** instead of the category average. Left alone, AI models produce a recognizable set of defaults (indigo gradients, the hero → three cards → testimonials → pricing page, all-caps eyebrow labels, fade-up on every section). The skill grounds every visual decision in your actual subject and makes the AI check its plan against those defaults before building.
2. **Hold a production quality floor** — WCAG 2.2 AA accessibility, responsive layout, performance, all UI states, solid forms and navigation — without making a show of it.

The biggest change from earlier versions: **the AI must look at what it built.** It renders the page, takes screenshots at phone and desktop widths, critiques them, and fixes what it sees before calling the work done.

## How It Works

### 1. Scope gate

- Your brief's own words win: brand guidelines, Figma files, named fonts or colors, or a requested style are implemented exactly.
- **Existing design system** (Tailwind `@theme`/config, tokens, shadcn/MUI/Chakra…) → the AI builds inside it and does not invent a new look.
- **Small change to existing UI** → it matches the surrounding design and skips the design plan, but still checks the result visually.
- **New UI or a redesign** → the full design process below.

### 2. Design process (new UI)

1. **Ground it in the subject.** Not "a fintech dashboard" but "a cash-flow tool for independent bakeries". The subject's materials, vocabulary and audience are where distinctive choices come from. If your brief doesn't say, the AI proposes a specific subject and confirms it with you.
2. **Write a design plan** before any code:

   ```
   Subject:   Cash-flow tool for independent bakeries — for owner-operators — primary job: scan
   Signature: Daily cash position drawn as a "proofing" curve across the week
   Color:     Crust oklch(0.55 0.11 60) · Flour oklch(0.97 0.01 85) · Rye oklch(0.32 0.03 60) · …
   Type:      A sturdy slab for headings + a humanist sans for UI (Google Fonts) — 1.25 scale
   Layout:    Left-aligned single column on mobile, week strip + ledger on desktop (ASCII wireframe)
   Density:   Balanced — owners check this between bakes, on a phone
   Motion:    One: the week curve draws in on load; everything else only responds to taps
   Avoid:     Trust-blue SaaS palette, identical KPI cards, gradient hero number
   ```

3. **Review the plan against the default.** The AI asks itself whether it would have produced roughly the same plan for a different subject. Wherever the answer is yes, it revises toward the subject and tells you what it changed.
4. **Build** — boldness in one place (the Signature), everything else quiet.
5. **Look at what was built** — screenshots at 375px and 1440px, critiqued in the order structure → hierarchy → spacing → typography → color → interaction → polish, then fixed and re-checked. If the environment has no way to render, the AI says so instead of claiming the design looks good.

### 3. Design guidance

- **Generic defaults to avoid** — a current list of palettes, layouts, typographic chrome, motion and copy that read as AI-generated. Allowed when your brief asks for them.
- **Typography** — faces chosen for the subject from free, loadable sources (Google Fonts, Fontshare, Fontsource); modular scales with `clamp()`; `text-wrap: balance`, tabular numerals, variable font axes, metric-matched fallbacks.
- **Color** — palettes authored in OKLCH, neutrals tinted toward the brand hue, semantic tokens only, state colors via `color-mix()`; dark mode as a deliberate decision with `color-scheme` / `light-dark()` and no flash on load.
- **Layout & motion** — deliberate alignment, hierarchy through size and space rather than containers, one orchestrated motion moment instead of effects everywhere.
- **Modern platform toolkit** — container queries, `:has()`, subgrid, `<dialog>`/`popover`, `@starting-style`; View Transitions, scroll-driven animations and anchor positioning as progressive enhancement.
- **Writing in the interface** — specific verbs, consistent action names, errors that explain the fix, no marketing filler.

### 4. Quality floor

Summarized in the skill, detailed in `skills/frontend-design/quality-standards.md`:

1. **Accessibility (WCAG 2.2 AA)** — text and non-text contrast, visible and unobscured focus, keyboard operation, target size, drag alternatives, accessible authentication, semantic HTML, reduced motion
2. **Touch & interaction** — target spacing, tap feedback, no hover-only actions, safe areas
3. **Performance** — Core Web Vitals targets (LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1), images, fonts, code splitting, virtualization
4. **Style consistency** — one icon set, token scales, one primary action per view
5. **Layout & responsive** — mobile-first, framework breakpoints vs. test viewports, container queries, `dvh` units
6. **Design tokens** — color, type, spacing, radius, elevation, z-index
7. **Dark mode** — when it belongs, and how to do it properly
8. **Animation**, 9. **Forms & micro-copy**, 10. **Navigation**, 11. **Charts**, 12. **Frontend-backend integration**

Every data-dependent view handles six states: loading, empty, error, success, partial/degraded, and pending.

### 5. Reference files

- `style-reference.md` — style vocabulary (25 styles), category conventions for ~30 product types (what users expect, what hurts, where to be distinctive — deliberately without prescribed palettes), and common page structures
- `tailwind-v4.md` — Tailwind v4 setup, `@theme`, the v4 dark-mode variant, directives (`@source`, `@plugin`, `@theme inline`…), v3→v4 renames, and v4.1 additions

## What to Expect

When you prompt "build me a project management tool" or "redesign my landing page", the AI will:

1. Confirm or propose the specific subject, audience and primary job
2. Show a design plan and say what it changed after checking it against generic defaults
3. Build with real content, a single signature element and the quality floor in place
4. Render and screenshot the result, critique it, and fix what it finds
5. Run the pre-delivery checklist before calling it done

## Activation

The skill activates automatically when your prompt involves frontend work. You can also invoke it directly:

```
Use frontend-design to build a dashboard for my analytics platform.
```

During plan execution or subagent-driven development, any task that produces visible UI applies frontend-design.

## Credits

The subject-grounding, plan-review and generic-defaults ideas were informed by Anthropic's `frontend-design` skill (Apache-2.0); the text here is original.
