---
name: wow-animations
description: Premium, performant web animations for showcase, architecture, and urban sites — smooth scroll, scroll-reveals, hero choreography, parallax, pinned/scrubbed sections, image reveals, counters, and micro-interactions. Use when building or animating any frontend or web UI where motion should feel cinematic but restrained.
---

# Wow Animations

Motion design for high-end web: cinematic, intentional, and never janky. Use this when a frontend should feel alive and premium — landing pages, architecture/urban showcases, portfolios, product reveals — without tipping into gimmick or hurting performance.

## Core philosophy (read first)

1. **One signature moment.** Pick ONE hero animation that defines the page (a hero reveal, a pinned scroll sequence, a map flythrough). Make it excellent. Keep everything else quiet. Scattered effects read as amateur; a single orchestrated moment reads as designed.
2. **Motion serves meaning.** Animate to reveal hierarchy, guide the eye, or show relationship — not to decorate. If an animation doesn't help the user understand or feel something true about the content, cut it.
3. **Fast in, calm out.** Entrances: 0.6–1.0s, `power3.out` / `expo.out` easing. Avoid bounce/elastic unless playful brand. Stagger groups by 0.06–0.12s.
4. **Transform & opacity only.** Animate `transform` (translate/scale/rotate) and `opacity`. Never animate `width`, `height`, `top`, `left`, `margin`, `box-shadow` in loops — they trigger layout and stutter.
5. **Reduced motion is mandatory.** Always honor `prefers-reduced-motion`. With it on, show final states instantly — no movement. This is non-negotiable for accessibility and for gov/institutional sites.
6. **Don't animate everything at once on load.** Above-the-fold hero animates on load; everything below animates on scroll-into-view. A page that fully choreographs on first paint feels slow.

## Decision guide — which technique for what

- **Text/elements appear as you scroll** → scroll-reveal with stagger (IntersectionObserver for simple sites, GSAP ScrollTrigger for control).
- **Hero headline lands with impact** → line-by-line mask reveal (clip the lines, slide up with stagger).
- **A section should hold while content changes / a sequence plays** → pinned + scrubbed ScrollTrigger.
- **Depth / layered movement** → parallax (scrub `yPercent` on background layers).
- **Horizontal story (districts, timeline, projects)** → pinned horizontal scroll.
- **Image entrance feels premium** → clip-path reveal (wipe), not a fade.
- **Stats / numbers** → count-up on scroll-into-view.
- **Buttons/cards feel tactile** → magnetic hover + subtle scale, 0.2s.
- **Whole-page polish between routes** → page transition overlay (cover → swap → uncover).

## Library setup (recommended stack)

- **Smooth scroll:** Lenis — the single biggest "feels expensive" upgrade. Lightweight, pairs with GSAP.
- **Animation engine:** GSAP + ScrollTrigger — industry standard, free, precise. Register the plugin once.
- **No-build / simple sites:** IntersectionObserver + CSS transitions cover 80% of reveals with zero deps. Use this when GSAP is overkill.

CDN (works in standalone HTML and in artifacts):
```
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js
https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js
https://unpkg.com/lenis@1.1.13/dist/lenis.min.js   (global: Lenis)
```
npm: `gsap`, `lenis`.

## Build order (apply in this sequence)

1. Set up Lenis smooth scroll + sync to ScrollTrigger.
2. Add the ONE hero signature animation (on load).
3. Add scroll-reveals to sections below the fold (staggered).
4. Add parallax / pinned sequence only where it earns its place.
5. Add micro-interactions (hover, magnetic, counters).
6. Wrap everything in `prefers-reduced-motion` handling — verify with it ON.
7. Test on a mid-range phone. If anything stutters, reduce or remove it.

## Quality floor (never ship without)

- 60fps on a mid-range phone; no layout thrash.
- Visible content if JS fails or is slow (don't leave elements stuck at `opacity:0`). Gate the hidden state behind a `js`/`gsap-ready` class so no-JS shows content.
- Keyboard focus unaffected by animation; no motion-locked navigation.
- `prefers-reduced-motion: reduce` → final states, instant.

## Ready-to-paste code

All copy-paste patterns (Lenis setup, scroll-reveal, hero mask reveal, parallax, pinned horizontal, count-up, magnetic button, page transition, reduced-motion wrapper) are in **PATTERNS.md** in this folder. Read it when implementing.
