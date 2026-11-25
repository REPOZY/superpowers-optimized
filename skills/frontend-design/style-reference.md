# Style & Convention Reference

**How to use this file:** it is vocabulary and context, not a picker. Look up what a style *is* and what users of a category *expect*, then make your own decision in the design plan (`SKILL.md` → Design Process). Choosing a row from these tables is the fastest route to the category average — the distinctive choice comes from the specific subject.

---

## Style Vocabulary

Most designs blend one or two of these. Every style must still pass the WCAG 2.2 AA checks in `quality-standards.md` — several (glass, neumorphism, aurora) need extra care.

| Style | Key characteristics | Fits | Risky when |
|---|---|---|---|
| **Swiss / International** | Strict grid, asymmetric balance, grotesk type, flush-left, few colors | Tools, documentation, institutions, editorial | Brand needs warmth or playfulness |
| **Exaggerated Minimalism** | Oversized type (`clamp(3rem, 8vw, 12rem)`), extreme whitespace, few elements | Fashion, luxury, art, portfolios | Dense information, dashboards |
| **Editorial / Magazine** | Multi-column grids, pull quotes, drop caps, strong typographic hierarchy | Long-form content, publications, storytelling | Tools and dashboards; non-editorial subjects (reads as a costume) |
| **Brutalism / Neubrutalism** | Raw structure, 2–4px borders, hard offset shadows, flat primaries | Creative studios, indie products, Gen-Z brands | Trust-sensitive domains (finance, health, legal) |
| **Glassmorphism** | Translucent layers, `backdrop-filter: blur(12–24px)`, light borders | Nav bars and overlays over imagery, media-rich surfaces | Text-heavy or data-dense surfaces (contrast varies with what's behind); low-end devices |
| **Neumorphism / Soft UI** | Dual light/dark shadows, extruded/inset controls, monochrome | Small control surfaces (a player, a thermostat) | Anything needing 3:1 non-text contrast on controls — hard to achieve; data-dense UI |
| **Claymorphism** | Soft 3D, rounded 16–24px, inner + outer shadows, pastel color | Education, children's products, playful consumer apps | Corporate, legal, finance |
| **Flat** | 2D, solid color, no shadows, icon-led | Cross-platform apps, system UIs, illustrations | Complex layering where depth carries hierarchy |
| **Bento Grid** | Modular tiles of deliberately varied sizes | Feature overviews, product showcases, personal sites | Linear content; when every tile ends up the same size |
| **Dark / OLED** | True-black or very dark surfaces, high-contrast accents | Media, dev tools, monitoring, night-use apps | Long-form reading for general audiences; print |
| **Aurora / Mesh Gradient** | Soft multi-color gradients, slow ambient motion (8–12s) | Brand moments, event pages, creative products | Performance-constrained targets; reduced-motion users (must stop); as default decoration |
| **Motion-Driven** | Scroll-linked effects, layered parallax, choreographed transitions | Storytelling, launches, portfolios | Tools, data UIs, motion-sensitive audiences |
| **Hero-Centric** | Full-viewport opening statement, single strong CTA | Launches, single-product pages, events | Multi-task apps, dashboards |
| **Conversion-Focused** | One goal per page, minimal navigation, proof near the CTA | Sign-up, lead-gen, pricing pages | Content sites, portfolios |
| **Data-Dense** | Compact spacing, tables, small multiples, tabular numerals | BI, admin, operations, trading | Consumer and marketing surfaces |
| **Executive Summary** | Few large metrics, comparisons, generous space | Leadership reporting, status overviews | Drill-down analysis |
| **Real-Time Monitoring** | Status colors with icons, live charts, connection state | DevOps, IoT, logistics, trading | Static content |
| **AI-Native / Conversational** | Minimal chrome, streaming text, composer-first layout | Assistants, copilots, chat tools | Multi-panel data work (needs a different layout) |
| **Organic / Biophilic** | Natural textures, irregular shapes, earthy palettes, flowing SVG | Wellness, food, sustainability, outdoor brands | Precision tools, security products |
| **Retro / Pixel** | Bitmap fonts, limited palettes, chunky UI | Games, indie products, nostalgia brands | Professional services, healthcare |
| **E-Ink / Paper** | Off-white surfaces, high contrast, monochrome, reading focus | Reading, notes, documentation | Media-heavy, highly dynamic UIs |
| **Spatial (visionOS-like)** | Layered translucent panels, depth, soft lighting | XR, immersive showcases | 2D productivity, accessibility-first contexts |
| **Cyberpunk / Terminal** | Neon on dark, HUD framing, monospace, glitch accents | Games, security research, hacker-culture brands | Conservative brands, general audiences |
| **Skeuomorphic / Tactile** | Real-world materials and affordances, rich textures | Instruments, audio tools, crafts, collectibles | Dense productivity UIs |
| **Maximalism** | Layered color, pattern and type, collage energy | Fashion, music, culture, events | Task-focused tools; anything needing calm |

---

## Category Conventions

What users of each category expect (keep these unless you have a reason not to), what reliably hurts there, and where distinctiveness is most welcome. **There are no prescribed palettes here on purpose** — derive color from the subject and brand, not the category.

| Category | Users expect | Usually wrong here | Room to be distinctive |
|---|---|---|---|
| **B2B SaaS (product UI)** | Fast scanning, restrained chrome, clear primary action | Decorative glass over data, motion on every element | Type, a brand color drawn from the subject, empty-state illustration |
| **SaaS marketing site** | A clear claim, proof, honest pricing | The generic SaaS kit verbatim | Show the product working in the hero; a signature layout |
| **E-commerce** | Big product imagery, price/variant clarity, trust signals by the buy button | Text-heavy pages, tiny images, surprise costs at checkout | Art direction of imagery, typographic voice |
| **Luxury retail** | Restraint, large imagery, refined type, unhurried pacing | Discount-badge clutter, bright block colors, bouncy motion | Editorial layouts, slow deliberate transitions (400–600ms) |
| **Healthcare (patient-facing)** | Calm, legible (≥ 16px, ideally 18px body), plain language | Low-contrast soft UI, neon, heavy motion | Warm, humane imagery; a non-clinical palette |
| **Consumer finance / banking** | Clarity, precise numbers, visible security cues | Novelty styling, crypto-neon, dark-by-default | Typography and the way numbers are presented |
| **Trading / pro finance tools** | Density, tabular numerals, red/green with non-color backup; dark themes common (offer light) | Spacious marketing layouts, ornament, slow rendering | Grid discipline, data typography |
| **Analytics dashboard** | Visible filters, neutral surfaces so data colors carry meaning | Decorative color competing with data | Density choice, chart styling |
| **Developer tool** | Keyboard-first, command palette, monospace for code, light + dark themes | Marketing gloss inside the product | Type pairing, syntax theme as brand |
| **AI / chat product** | Minimal chrome, streaming feedback, readable long output | Default indigo/violet "AI" palette, sparkles and glowing orbs | Identity from what the assistant is *for* |
| **Productivity** | Speed (≤ 150ms feedback), shortcuts, low friction | Long onboarding, decorative motion | Micro-interactions that confirm actions |
| **Creative studio / agency** | A strong point of view, the work up front | Corporate templates, hidden portfolio | Almost everything — keep navigation usable |
| **Portfolio** | The work first, large media | Effects that compete with the work | Layout and type as signature |
| **News / editorial** | Reading comfort, clear typographic hierarchy | Clutter, ad-like modules everywhere | Typeface choice, grid |
| **Documentation** | Left nav, right TOC, search, copyable code blocks, version switcher | Marketing layouts, hidden search | Typography, code theme, diagrams |
| **Education / children** | Friendly shapes, large targets, visible progress | Dense text, small targets | Illustration, playful motion responding to actions |
| **Fitness** | Energy, progress visualization | Static, low-energy layouts | Data visualization of progress |
| **Restaurant / food** | Appetizing photography; menu, hours, location, booking easy to find | Menu as PDF, text over busy photos | Art direction, typographic voice |
| **Real estate** | Large photography, maps, key facts scannable | Cramped listing cards, low-quality photos | Map interaction, listing layout |
| **Travel** | Destination imagery, a clear booking flow | Generic stock, complicated booking | Imagery and place-specific typography |
| **Non-profit** | Mission, evidence of impact, an obvious donate path | Hidden donate button, no impact data | Storytelling layout |
| **Legal / professional services** | Authority through restraint, credentials visible | Playful styling, stock-handshake imagery, navy-and-gold by reflex | Typographic voice |
| **Government / public service** | Maximum clarity, plain language, AA+ contrast; use the national design system if one exists (GOV.UK, USWDS, NL Design System) | Ornament, motion, novelty | Very little — clarity is the brand |
| **Music / video streaming** | Content artwork drives color; dark surfaces common | Chrome competing with artwork | Player design, artwork-derived theming |
| **Gaming** | Immersion, expressive type and motion | Corporate minimalism | Nearly everything — watch performance |
| **Smart home / IoT** | Device state at a glance, large controls | Low-contrast soft-UI controls, slow state updates | Control design, status visualization |
| **Marketplace / job board** | Prominent search and filters, trust signals (reviews, verification) | Hidden filters, confusing listing cards | Listing card design, category navigation |
| **Social** | Content first, fast interactions | Heavy chrome, poor accessibility | Interaction feedback, profile expression |

---

## Common Page Structures

Starting points for information architecture, not layouts to copy. Reorder, cut or merge sections based on what *this* audience needs first.

| Page type | Typical structure | Key components |
|---|---|---|
| **App dashboard** | Collapsible sidebar + top bar + main grid | KPIs, charts, tables, activity, filters |
| **Landing page** | Claim → proof → how it works → offer → action | Hero, evidence (demo, numbers, quotes), CTA. The default hero → logos → 3 cards → testimonials → pricing order is the generic kit — question each section |
| **Admin panel** | Fixed sidebar + breadcrumb bar + content | CRUD tables with sort/filter/search, detail drawers, bulk actions |
| **Product detail** | Sticky nav + gallery + details + related | Gallery, variant selector, add-to-cart, reviews |
| **Documentation** | Left nav + content + right TOC (sticky) | Search, version switcher, code blocks with copy, prev/next |
| **Article / editorial** | Headline + lead + body + related | Reading time, TOC for long pieces, share, related |
| **Settings** | Section nav + form groups | Save/cancel per section, danger zone last |
| **Auth** | Focused single column, minimal chrome | Form, passkey/social sign-in, link to the alternate flow, inline errors |
