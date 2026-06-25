# Wow Animations — Patterns

Copy-paste, framework-agnostic. GSAP/ScrollTrigger + Lenis unless noted. Adjust selectors to your markup.

---

## 0. Reduced-motion gate (wrap everything)

```js
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initAnimations() {
  if (reduceMotion) {
    // show all final states instantly, no motion
    document.querySelectorAll('.reveal').forEach(el => el.style.opacity = 1);
    return;
  }
  // ...all gsap/lenis setup goes here
}
document.addEventListener('DOMContentLoaded', initAnimations);
```

CSS — hide reveal targets only when JS is active, so no-JS still shows content:
```css
.js .reveal { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .js .reveal { opacity: 1 !important; transform: none !important; }
}
```
```html
<script>document.documentElement.classList.add('js');</script>
```

---

## 1. Lenis smooth scroll + ScrollTrigger sync

```js
gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({ duration: 1.1, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)) });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add(time => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

---

## 2. Scroll-reveal with stagger (GSAP)

```js
gsap.utils.toArray('.reveal').forEach(el => {
  gsap.to(el, {
    y: 0, opacity: 1, duration: 0.9, ease: 'power3.out',
    scrollTrigger: { trigger: el, start: 'top 85%' }
  });
});
```
Start state in CSS: `.js .reveal { opacity: 0; transform: translateY(28px); }`

### Stagger a group (cards/list)
```js
gsap.to('.card', {
  y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.09,
  scrollTrigger: { trigger: '.card-grid', start: 'top 80%' }
});
```

### No-GSAP version (IntersectionObserver — zero deps)
```js
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: 0.15 });
document.querySelectorAll('.reveal').forEach(el => io.observe(el));
```
```css
.js .reveal { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(.22,.61,.36,1), transform .8s cubic-bezier(.22,.61,.36,1); }
.js .reveal.in { opacity: 1; transform: none; }
```

---

## 3. Hero headline — line-by-line mask reveal (signature)

```html
<h1 class="hero-title">
  <span class="line"><span>Формируем</span></span>
  <span class="line"><span>облик столицы</span></span>
</h1>
```
```css
.hero-title .line { display: block; overflow: hidden; }       /* the mask */
.hero-title .line > span { display: block; transform: translateY(110%); }
```
```js
gsap.to('.hero-title .line > span', {
  y: '0%', duration: 1.0, ease: 'expo.out', stagger: 0.12, delay: 0.15
});
```
Add a soft fade-in for sub-text and CTA with `delay: 0.6` so the hero choreographs in sequence, not all at once.

---

## 4. Image reveal — clip-path wipe (premium > fade)

```css
.img-reveal { clip-path: inset(0 100% 0 0); }   /* hidden, wipes left→right */
```
```js
gsap.to('.img-reveal', {
  clipPath: 'inset(0 0% 0 0)', duration: 1.1, ease: 'power4.inOut',
  scrollTrigger: { trigger: '.img-reveal', start: 'top 80%' }
});
```

---

## 5. Parallax (layered depth)

```js
gsap.utils.toArray('[data-parallax]').forEach(layer => {
  const speed = parseFloat(layer.dataset.parallax) || 20; // % of travel
  gsap.to(layer, {
    yPercent: -speed, ease: 'none',
    scrollTrigger: { trigger: layer.closest('section'), start: 'top bottom', end: 'bottom top', scrub: true }
  });
});
```
`<div data-parallax="25" class="bg"></div>` — bigger number = more movement. Keep backgrounds slower than foreground.

---

## 6. Pinned horizontal scroll (districts / timeline / projects)

```html
<section class="pin-wrap"><div class="track">
  <article class="slide">…</article>
  <article class="slide">…</article>
  <article class="slide">…</article>
</div></section>
```
```css
.pin-wrap { overflow: hidden; }
.track { display: flex; }
.slide { flex: 0 0 100vw; height: 100vh; }
```
```js
const track = document.querySelector('.track');
gsap.to(track, {
  x: () => -(track.scrollWidth - window.innerWidth), ease: 'none',
  scrollTrigger: {
    trigger: '.pin-wrap', pin: true, scrub: 1,
    end: () => '+=' + (track.scrollWidth - window.innerWidth)
  }
});
```

---

## 7. Count-up stat on scroll

```js
gsap.utils.toArray('[data-count]').forEach(el => {
  const end = parseFloat(el.dataset.count);
  gsap.fromTo(el, { innerText: 0 }, {
    innerText: end, duration: 1.6, ease: 'power2.out', snap: { innerText: 1 },
    scrollTrigger: { trigger: el, start: 'top 85%' }
  });
});
```
`<b data-count="6">0</b>` → counts to 6 when in view.

---

## 8. Magnetic button / card (micro-interaction)

```js
document.querySelectorAll('.magnetic').forEach(btn => {
  btn.addEventListener('pointermove', e => {
    const r = btn.getBoundingClientRect();
    const x = e.clientX - r.left - r.width / 2;
    const y = e.clientY - r.top - r.height / 2;
    gsap.to(btn, { x: x * 0.3, y: y * 0.3, duration: 0.4, ease: 'power3.out' });
  });
  btn.addEventListener('pointerleave', () => gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: 'elastic.out(1,0.4)' }));
});
```
Pair with CSS `transition: transform .2s` and a slight `scale(1.03)` on `:hover`. Disable on touch (no hover): wrap in `if (matchMedia('(hover:hover)').matches)`.

---

## 9. Page transition (cover → swap → uncover)

```css
.transition-overlay { position: fixed; inset: 0; background: #0B141F; transform: scaleY(0); transform-origin: bottom; z-index: 9999; }
```
```js
async function navigate(url) {
  await gsap.to('.transition-overlay', { scaleY: 1, transformOrigin: 'bottom', duration: 0.5, ease: 'power4.inOut' });
  window.location.href = url; // or swap content in an SPA
}
// on new page load:
gsap.to('.transition-overlay', { scaleY: 0, transformOrigin: 'top', duration: 0.6, ease: 'power4.inOut' });
```

---

## Tuning cheatsheet

| Want | Easing | Duration |
|---|---|---|
| Crisp entrance | `power3.out` / `expo.out` | 0.6–1.0s |
| Heavy / cinematic | `power4.inOut` | 1.0–1.4s |
| Playful pop | `back.out(1.6)` | 0.4–0.7s |
| Scrubbed (tied to scroll) | `none` | — (scrub) |

Stagger: 0.06–0.12s. Parallax travel: 10–30%. Never exceed ~1.4s for entrances — it reads as slow, not premium.
