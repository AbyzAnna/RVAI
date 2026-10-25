# RVAI Visual Redesign Brief (v2)

**Scope:** visual only, in `ui/index.html`, `ui/styles.css` and `ui/shell.js`.
- `ui/app.js` is untouched, and every app element ID is preserved.
- No backend, auth, storage, network calls, fake projects or statistics were added.

**Related docs:** palette source in `docs/palette-reference.md`; structural reference in `docs/n8n-reference-brief.md`.

## Direction
The idea is "an open constellation". Students, projects and paths are nodes connected into a network, so RVAI reads as a living, open-source workflow rather than a plain chat page. It stays light and readable for long text, with deep-ocean accents for depth.

- **Surfaces:**
  - Off-white pages with two soft radial glows (aqua at top right, pink at left) and a faint blueprint grid made from CSS gradients.
  - No images. The water texture is not used.
  - Cards use a white-to-off-white gradient, a hairline border and a two-layer shadow. On hover they lift 4px, the border turns aqua and the icon badge tilts.
- **Depth bands:** the hero canvas and the community band are navy-to-petrol with radial highlights in cyan and pink.
- **Palette roles:**

| Color | Used for |
|---|---|
| Navy and petrol | Primary text, primary buttons, dark bands |
| Cyan and aqua | Focus rings, connectors, active states |
| Crimson to red | The single key action ("Try Innovate"), the Innovate nav icon, Problem/Create accents |
| Pink | Gradient tails only |
| Blue-gray | Metadata |

  Red is never the error color.
- **Type:** the existing Space Grotesk headings and DM Sans body, with a larger hero. The second hero line uses gradient text (petrol → teal → crimson). It falls back to solid petrol, and to `CanvasText` in forced-colors mode.

## Logo: the RVAI mark
- An inline SVG `<symbol id="rvai-mark">` with a `<title>`, used via `<use>` in:
  - the header
  - the sidebar
  - the Innovate welcome screen
  - the OpenSource empty state
  - the dialog
- **The mark:**
  - a rounded navy/petrol tile
  - an "R" drawn as a constellation: stroked letter with aqua nodes at its vertices
  - a tilted orbit ellipse (cyan → pink gradient) carrying a coral satellite node
  - The orbit rotates slowly (18s) as one group.
- **Accessibility:** the header instance is `role="img" aria-label="RVAI logo"`. The visible **RVAI** wordmark next to it is the fallback if the SVG fails. Other instances are `aria-hidden`.

## Icon system
- A local sprite of `<symbol>` icons on a 24×24 grid, 1.8 stroke, round caps, colored with `currentColor`. No icon libraries or external files.
- **Nav icons:** each tab has its own icon and color.

| Tab | Icon | Color |
|---|---|---|
| About | compass | petrol |
| Alternatives | search lens | blue |
| Innovate | sparkle | crimson |
| RVAI OpenSource | branching network | teal |

- **Workflow and section icons:**

| Use | Icon |
|---|---|
| Describe | chat |
| Find | radar |
| Extend | puzzle |
| Create | cube |
| Websites | browser |
| Design tools | drafting compass |
| Problem | lock |
| Mission | seedling |
| Try | rocket |
| Sign up | user-plus |
| Evidence | book |
| Community | network |
| Catalog categories | cube (CAD), film (video), blocks (games) |

- Icons sit in **badges** in four tones (aqua, coral, blue, navy) so neighboring cards differ.
- Icons are decorative: `aria-hidden="true" focusable="false"`. Labels always stay as visible text.

## Motion
| Element | Motion |
|---|---|
| Hero canvas nodes | Float (7s, staggered) |
| Hero canvas wires | Flowing dashes |
| Hero canvas | Gentle pointer tilt (fine pointers only, throttled to one update per frame) |
| Workflow step connectors | Animated dashes ending in a "port" dot |
| Community band | Twinkling constellation |
| Kicker dot | Ping |
| Mode badge | Pulse |
| Welcome mark | Floating, with halo rings |
| Chat messages | Fade/rise in |
| Dialog | Pops in |
| Accent button | Shimmer on hover |

- **Reveal on scroll:** shell.js adds `.js-motion` and uses IntersectionObserver to add `.is-visible`.
- **Performance:** everything animates only `transform`, `opacity`, `background-position` or `stroke-dashoffset`. No layout-thrashing properties and no JavaScript animation loops.

## Accessibility guardrails
- **Reduced motion:** `prefers-reduced-motion: reduce` turns off all animations and transitions, forces revealed content visible and drops the tilt. shell.js never enables reveal or tilt in that mode, and reacts if the setting changes mid-session.
- **Content visible without JS:** reveal states apply only under `.js-motion`, and `:focus-within` reveals any block that keyboard focus enters.
- **Focus:** a shared `:focus-visible` style (2px petrol outline plus an aqua halo) on links, buttons, summaries and fields. The composer and search box glow when focused.
- **Decorative visuals hidden:** the hero canvas, its floating chips and the constellations are `aria-hidden`. Their meaning is repeated in the text workflow list.
- **Contrast:** body text on white or off-white uses navy or `#56707f`. White text sits only on navy, petrol or crimson→red (checked by hand, roughly ≥4.5:1). Gradient text is large-text only. Formal tool checks are still pending.
- **Narrow screens (≤480px):** inactive nav items show only their icon. Their labels stay in the DOM, visually hidden, so the accessible names don't change.

## v3: editorial reference layer
**Source:** a user-supplied screenshot of another AI product's marketing site, used for inspiration only. n8n remains the general UX reference for workflow storytelling.

**What we took from it:**
- high-contrast black editorial panels on a pale page
- electric-blue and pale-blue gradients
- giant pixel/monospace display type, including a ghosted watermark word
- white pill CTAs
- a blue framed grid of prompt cards
- a framed, browser-like media block with tilted cards floating around it

**How RVAI adapts it:**
- **Palette:** "black" becomes ocean abyss (`#020d15 → #03182a → #05263a`). "Electric blue" becomes ocean blue, petrol and cyan glows, with a coral glow in one corner. The page behind the panels is a pale aqua gradient, not pale blue.
- **Type system:** each level has one job, so the text styling reads as deliberate.
  - **Pixel display** (headline-sized, uppercase, decorative): system monospace masked into square "pixels" with a CSS grid mask. No font downloads.
  - **Headlines:** Space Grotesk.
  - **Body:** DM Sans.
  - **Labels** (eyebrows, chips, kickers, badges): mono uppercase with wide tracking.
  - Pixel display appears only at large sizes, so the mask doesn't hurt legibility. It's turned off in forced-colors mode.
- **Hero:** a dark editorial panel.
  - A giant pixel **RVAI** wordmark, our own pixel letterforms drawn in SVG with a coral "node" dot. It's `aria-hidden`, and the real `<h1>` stays text.
  - The workflow diagram sits in a framed media window (traffic-light bar, "rvai · innovate preview") that overlaps the wordmark.
  - Floating chips are tilted for a collage feel.
  - White and coral pill CTAs.
- **"Make it real" panel:** a dark panel with pixel title, two glass tiles (Websites, Design tools) and a framed ocean-blue grid of four **prompt cards** in a staggered masonry offset.
  - Each card opens Innovate in preview-demo mode with the prompt *pre-filled, never sent*.
  - The prompts are written to route correctly in `app.js` (website, CAD, video, extend OpenSCAD).
- **Community band:** now a dark editorial panel with a ghosted pixel **OPEN** watermark behind the copy, plus the existing constellation.
- **Alternatives and OpenSource page titles:** pixel display in a navy→petrol gradient, used on light backgrounds.

**Motion added:**

| Element | Motion |
|---|---|
| Hero wordmark | Resolves column by column on load (`steps()` clip-path wipe) |
| Pixel titles | The same wipe when their section is revealed |
| Dark panels | Unfold from a clipped, slightly scaled state |
| Cards in prompt grid, tiles, start paths and evidence | Stagger in |
| Route changes | Fade and rise for page views, fade only for Innovate (so the mobile fixed sidebar isn't affected) |
| Prompt cards | Hover lift, aqua glow, icon turns coral |

All of it is transform, opacity or clip-path only.
- **Reduced motion:** all of it is disabled, and panels render unclipped and unscaled. Without JS (or under reduced motion) nothing starts hidden. Light focus rings are used inside dark panels.

**Not copied:** the reference's brand, wordmark, text, imagery (3D renders, photos), phone mockup, pricing table and exact grid layout.

## Not done / next
- Automated contrast and axe checks; a cross-browser check of animations inside `<use>` (where unsupported, the mark simply stays static).
- More references from the user may change the composition. Tokens are centralized in `:root` to make that easy.
