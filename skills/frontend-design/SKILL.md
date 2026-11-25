---
name: frontend-design
description: >
  Use for any frontend, UI, or web interface implementation.
  Drives distinctive, subject-specific visual design with a render-and-critique
  loop, on top of a production quality floor (accessibility, responsive,
  performance, UI states). Triggers on: "build a UI", "frontend", "website",
  "landing page", "dashboard", "redesign", "make it look professional",
  "make it look better", "make it modern", any React/Vue/Svelte/HTML/CSS
  component work. Routed by using-superpowers, or invoke directly via
  /frontend-design.
---

# Frontend Design

Work like the design lead of a studio whose clients pay for a point of view. Generic output is the failure mode: a UI that is technically correct but could belong to any product after a find-and-replace on the logo. Every visual choice should trace back to *this* brief.

## Scope Gate — Before Anything Else

1. **The brief's own words win.** Brand guidelines, Figma files, named colors/fonts, or an explicitly requested style are implemented exactly — even if that style appears in the "generic defaults" list below.
2. **Existing design system?** Look for `@theme` blocks or `tailwind.config.*`, `theme.ts`, `tokens.json`, `design-system/`, a component library (shadcn, MUI, Chakra, Radix themes).
   - **Yes** → read it and build inside it. Do not invent a new palette or type system. Add tokens only for real gaps. Skip to **Build**, then run **Look at What You Built** and the **Quality Floor**.
3. **Modifying existing UI** (a button, a form field, a layout fix) → match the surrounding design. Skip the design plan. Still run **Look at What You Built** for anything visible.
4. **New UI or redesign** → follow the full **Design Process**.

## Design Process (new UI or redesign)

### 1. Ground it in the subject

Identify: the concrete subject, the audience, and the page's primary job (scan, convert, explore, act). If the brief doesn't say, propose one specific answer and confirm it.

Distinctive choices come from the **subject**, not the product category. "Fintech dashboard" yields the category average; "a cash-flow tool for independent bakeries" suggests a palette, vocabulary, imagery and density of its own. Mine the subject's materials, artifacts, era, tools and language for the visual idea. Use real content from the brief throughout — never lorem ipsum.

`style-reference.md` lists style vocabulary and **category conventions** (what users of a category expect for trust and legibility). Read it to know the conventions — then decide deliberately which to keep and which to break. It is not a palette picker.

### 2. Write a design plan

Output this before any code:

```
**Subject**: [specific subject] — for [audience] — primary job: [scan/convert/explore/act]
**Signature**: [the ONE memorable element — a type treatment, layout move, motif, or interaction]
**Color**: 4–6 named tokens with values (e.g. Kiln oklch(0.62 0.14 45) — primary actions)
**Type**: [face(s)] — roles — scale ratio — source (Google Fonts / Fontshare / Fontsource / system)
**Layout**: one-sentence concept + ASCII wireframe of the key view; alignment (left/center/justified) and why
**Density**: compact / balanced / spacious — and why
**Motion**: the one orchestrated moment (if any) + what responds to user actions
**Avoid**: the generic defaults this brief would most tempt you into
```

### 3. Review the plan against the default

Ask: *"If I got a similar brief for a different subject, would I produce roughly this?"* For every part where the answer is yes — palette, fonts, hero treatment, layout, motion — revise it toward the subject, and state in one line what you changed and why. Only then build.

### 4. Build

Follow the revised plan. Spend boldness in **one** place (the Signature); keep everything around it quiet and disciplined. Before finishing, remove one decorative element that doesn't serve the brief.

Keep CSS specificity flat and predictable — section-level and component-level selectors that both set padding/margin silently cancel each other. Prefer `@layer` and single-class selectors.

### 5. Look at What You Built (required)

You cannot judge a design you have not seen. After the first build and after each significant visual change:

1. Render the page and capture screenshots at **375px** and **1440px** wide (add 768px for complex layouts). Use whatever the environment offers: a browser/Playwright skill or MCP tool, `npx playwright screenshot --viewport-size "375, 812" --full-page <url> mobile.png`, or a built-in preview.
2. Open and inspect the screenshots. Critique them against the design plan in this order: **structure → hierarchy → spacing → typography → color → interaction → polish**. Earlier items affect everything downstream.
3. Check specifically: Is the Signature visible? Is the hierarchy clear within 3 seconds? Does anything match the generic defaults below? Any overflow, clipping, collisions or orphaned single words in headings?
4. Fix, re-render, re-inspect. At least one full critique → fix cycle before declaring done.

If no rendering tool is available, say so explicitly in the final report and list what was not visually verified. Never claim a UI "looks good" without having viewed it. Stop any dev server you started once screenshots are done.

## Generic Defaults to Avoid

These are not wrong in themselves — they are what models produce *regardless of subject*, so they read as AI-generated. Use one only when the brief or subject genuinely calls for it.

**Palettes and surfaces**
- Indigo/violet primary (`#6366F1`, `#8B5CF6`) or purple-to-blue gradients
- Warm cream background with a high-contrast serif and a terracotta/clay accent
- Near-black background with a single acid-green, lime or vermilion accent
- "Trust blue" + white for anything business-related
- Gradient washes and blurred color blobs as decoration with no structural role

**Layout and components**
- The SaaS kit: hero → logo strip → 3 equal feature cards → testimonials → pricing → CTA → footer
- Everything chopped into identical rounded cards with the same radius and the same soft grey shadow
- Newspaper/broadsheet styling (hairline rules, zero radius, dense columns) on a non-editorial subject
- Hero = huge number + small label + supporting stats + gradient accent
- Centered everything; symmetric grids where every item has equal weight

**Typographic chrome**
- Tracked-out ALL-CAPS eyebrow labels above every heading
- Emphasizing one word of a headline in italic, a gradient or an accent color
- Meta strings joined with middle dots (`A · B · C`), labels in a spaced em-dash pattern (`WORD — fragment`)
- `→` appended to every button and link; monospace for small data labels by reflex
- Numbered markers (01 / 02 / 03) on content that is not actually a sequence

**Motion and copy**
- Fade-and-slide-up on every section; hover lift on every card; scroll-reveal as the "signature"
- Copy like "Unlock the power of…", "Seamless", "Elevate your…", "Built for the modern…"

Structural devices (borders, numbering, labels, dividers) should encode information about the content, not decorate it.

## Typography

Typography carries most of the personality. Choose it before color.

- **Pick faces for this subject**, not your usual defaults. Avoid falling back on Inter, Roboto, Open Sans, Arial, Space Grotesk or `system-ui` as the *display* face unless that is a deliberate, stated choice. One family used with intent beats two mismatched ones; if you pair, make the two clearly distinct.
- **Free, loadable sources only**: Google Fonts, Fontshare, Fontsource (npm, self-hosted), or system stacks. Never specify a commercial face you cannot load — it silently falls back.
- **Scale**: a modular ratio (1.2–1.333 for UI, up to 1.5+ for editorial display) applied through `clamp()` for fluid sizes. Headline type can be an active visual element — size, weight, width, tracking — not just a container for words.
- **Details that separate pro from default**:
  - `text-wrap: balance` on headings, `text-wrap: pretty` on paragraphs
  - Tighten tracking on large display sizes; loosen it on small all-caps (when caps are justified)
  - Measure under ~75ch (`max-width: 65ch` is a good body default); serif body text gets slightly more line-height than sans
  - `font-variant-numeric: tabular-nums` for tables, prices, timers
  - Variable fonts: use the weight/width/optical-size axes instead of loading many static files; `font-optical-sizing: auto`
  - Metric-matched fallbacks (`size-adjust`, `ascent-override` in `@font-face`) to avoid layout shift on font swap

## Color

- **Author palettes in OKLCH.** Lightness is perceptually even, so hover/active states and tonal ramps stay consistent: `oklch(L C H)`.
- **Tint the neutrals** toward the brand hue (chroma ~0.005–0.02) instead of pure grey; it ties the palette together.
- **Semantic tokens only** in components (`--color-surface`, `--color-text-muted`, `--color-action`, `--color-danger`) — no raw hex/oklch in component code.
- Derive states with `color-mix(in oklch, var(--color-action), black 12%)` rather than hand-picking hover colors.
- **Dark mode is a decision, not a default.** Add it when the audience/context benefits. When you do: `color-scheme: light dark`, `light-dark()` or per-theme token blocks, lighter/desaturated tonal variants (never inversion), elevation via lighter surfaces instead of shadows, and a pre-paint inline script for the stored preference to avoid a flash.
- Verify contrast on the actual color pairs you shipped, in every theme.

## Layout, Composition, Motion

- **Decide alignment deliberately.** Left-aligned is the strong default for reading and scanning; center only for short, ceremonial content.
- Create hierarchy with size, weight, position and space — not color alone, and not containers. Not everything needs a card; group with spacing first.
- Vary visual weight: one dominant element per view, the rest supporting. Asymmetry, bento grids, split screens and offset columns are tools — use one when it serves the content.
- Adapt hierarchy across breakpoints (a sidebar may become a bottom sheet), not just stacked columns.
- **Motion**: one orchestrated moment (a page-load sequence or a single reveal) beats scattered effects. Motion that responds to user action (open, expand, confirm, reorder) is welcome when it shows what changed. Animate `transform`/`opacity`; 150–300ms for micro-interactions, ≤400ms for larger transitions; guard everything with `prefers-reduced-motion`.

## Modern Platform Toolkit

Prefer native platform features over JS libraries. Baseline-available (safe to use):

- Container queries (`@container`, `cqi` units) for components that adapt to their slot, not the viewport
- `:has()` for parent/sibling-aware styling; subgrid for aligned nested content; native CSS nesting; `@layer` for cascade control
- `<dialog>` and the `popover` attribute for modals, menus and tooltips (focus handling and top-layer for free)
- `@starting-style` + `transition-behavior: allow-discrete` for entry/exit animations of dialogs and popovers
- `oklch()`, `color-mix()`, `light-dark()`; `dvh`/`svh` viewport units; `text-wrap: balance`

Progressive enhancement (check current Baseline/caniuse status; wrap in `@supports` with a working fallback):

- View Transitions (same-document widely supported; cross-document `@view-transition` less so)
- Scroll-driven animations (`animation-timeline: scroll()` / `view()`)
- CSS anchor positioning; `field-sizing: content`; `interpolate-size` for animating to `height: auto`

## Writing in the Interface

Copy is design material; generic copy makes a distinctive design feel templated.

- Name things the way users think of them ("Notifications", not "Webhook config"). Describe what something does; don't sell it.
- Buttons are specific verbs ("Save changes", "Create project"). The same action keeps the same name across the flow: "Publish" → toast "Published".
- Errors state cause + fix, without apology or vagueness. Empty states say what the space is for and offer the action to fill it.
- Sentence case, active voice, no filler. Realistic placeholder examples, never placeholder-as-label.

## Quality Floor (non-negotiable, never announced)

Full rules and rationale: `quality-standards.md`. Read it for greenfield builds, forms, dashboards, or anything with backend data.

- **Accessibility — WCAG 2.2 AA**: text contrast 4.5:1 (3:1 for large text); **3:1 for UI components, focus indicators and meaningful graphics**; visible `:focus-visible` styles not hidden by sticky headers; keyboard operable throughout; semantic HTML and one `h1` with no skipped levels; `aria-label` on icon-only controls; never color alone; skip link; targets ≥24×24px (aim for 44×44px on touch).
- **Responsive**: mobile-first; no horizontal scroll at 375px; ≥16px body text on mobile; viewport meta never disables zoom; `min-h-dvh` instead of `100vh`.
- **Performance**: explicit `width`/`height` or `aspect-ratio` on media; lazy-load below-fold images; WebP/AVIF with `srcset`; `font-display: swap`; preload only critical fonts; reserve space for async content (CLS < 0.1); virtualize long lists.
- **Consistency**: one SVG icon set (Lucide, Phosphor, Heroicons, Tabler) — never emoji as icons; radius, elevation and z-index from token scales; one primary action per view.

### UI States

Every data-dependent view handles all six states:

| State | Show |
|---|---|
| **Loading** | Skeleton matching the final layout (not a lone spinner) |
| **Empty** | What this space is for + the action to fill it |
| **Error** | What went wrong + how to fix it + retry |
| **Success** | The content, fully interactive |
| **Partial / degraded** | Available data + what's missing or stale ("Updated 5m ago") |
| **Pending** | Inline progress on the triggering control; prevent double-submit; revert on failure |

## Pre-Delivery Checklist

- [ ] Design plan was written and reviewed against the generic default (new UI only)
- [ ] Screenshots at 375px and 1440px were captured **and inspected**; at least one critique → fix cycle done (or the gap is stated)
- [ ] The Signature element is visible in the screenshots; nothing from "Generic Defaults to Avoid" slipped in unintentionally
- [ ] Hierarchy is clear within 3 seconds; one primary action per major section
- [ ] Keyboard-only pass works with visible focus; contrast checked on shipped color pairs (all themes)
- [ ] No horizontal scroll at 375px; reduced-motion respected
- [ ] All six UI states exist for data-dependent views
- [ ] Copy is real, specific and consistent — no lorem ipsum, no marketing filler

## Framework & Version Awareness

1. **Existing project** — detect the framework and major version from `package.json` and CSS entry files. Use what is there. Never silently upgrade.
2. **Greenfield** — use the latest stable major and state it ("Using Tailwind CSS v4.x").
3. **Ambiguous** — ask before writing setup code; never mix major-version patterns.
4. **Breakpoints**: use the framework's scale (Tailwind: 640/768/1024/1280/1536) or content-driven ones. Test *viewports* at 375/768/1024/1440 — these are test widths, not breakpoints.

**Tailwind**: read `tailwind-v4.md` before any Tailwind setup or utility work on greenfield or version-unknown projects — training data is biased toward v3 syntax (including dark mode, which works differently in v4).

**Stack** (greenfield, when unspecified): plain HTML + CSS for simple pages; Vite + React/Vue/Svelte + Tailwind v4 for apps; Next.js/Nuxt/SvelteKit/Astro when routing, SSR or content collections are needed. Prefer accessible primitives (Radix, React Aria, Ark UI, shadcn/ui) over hand-rolled widgets for menus, dialogs, comboboxes.

## When to Use in Superpowers

- During `executing-plans` or `subagent-driven-development` whenever a task produces visible UI
- Run the Design Process before implementation of new UI; run **Look at What You Built** before `verification-before-completion`

## Supporting References

- `quality-standards.md` — full accessibility (WCAG 2.2), touch, performance, layout, forms, navigation, dark mode, tokens, charts, and frontend-backend integration rules
- `style-reference.md` — style vocabulary, category conventions (know them, don't copy them), and common page structures
- `tailwind-v4.md` — Tailwind v4 install, `@theme`, dark-mode variant, directives, v3→v4 renames, v4.1 additions
