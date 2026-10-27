# Mory — reviewed design system

## Approved implementation rules (take precedence over the generated reference)

This is a UI-only modernization of an existing Vietnamese family journal, not a landing page or a product rebuild. The current routes, content, roles, handlers, validation, data models and privacy boundaries are immutable for this task.

- **Brand:** preserve Mory purple `#7962AB`, warm paper and charcoal. Keep Lucide and the existing Mory wordmark. The generated brown/indigo palette below is reference material, not a replacement palette.
- **Typography:** local system sans stack with complete Vietnamese fallback; 16px body/input, 14px labels, 12–13px metadata, restrained page headings. Keep font assets/network/CSP unchanged. The skill's focused `Vietnamese editorial readable` search matched **Vietnamese Friendly / Be Vietnam Pro + Noto Sans**; these are a future optional font choice, not a dependency for this refactor.
- **Layout:** preserve the existing app shell and information architecture. Improve spacing and text measure (65–75ch for prose), use shrinkable grids, keep all current actions visible. Desktop rail, mobile bottom navigation and existing auth/account destinations stay intact.
- **Components:** existing `tokens.css`, `globals.css`, `ui-review.css`, buttons, forms, dialogs and toast remain the only implementation system. Refine their tokens and styles; no new UI framework.
- **Interaction:** visible focus, 44px targets, 8px+ action gaps, focus scroll offsets around fixed navigation, associated labels/errors and descriptive state attributes. Existing dialog trapping/restoration, save timing and notifications keep their semantics.
- **Motion:** small color/opacity transitions, no entrance spectacle, reduced-motion respected. No animation library.
- **Verification:** demo + isolated real account mode, widths 320/375/390/414/768/1024/1440, keyboard, text zoom and before/after evidence.

### Skill fit and exclusions

The actual CLI classified the second query as **Diary & Journal App** and returned applicable minimalism, content hierarchy and warm-journal guidance. Its composite layout still describes a marketing narrative, and Kalam/Patrick Hand do not meet this project's established typography direction. Those portions are explicitly rejected. The first query's blue/green family-chore palette and hero/features/CTA layout were also rejected. Focused UX searches verified keyboard focus, unobscured focus, responsive text measure and font loading guidance; Next.js results were cross-checked against the installed 16.4.2 documentation. No generic result is treated as permission to add product behavior.

## Generated CLI reference — do not apply where it conflicts with the rules above

# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Mory UI Modernization
**Generated:** 2026-10-27 07:59:57
**Category:** Diary & Journal App
**Design Dials:** Variance 3/10 (Centered / Minimal) | Density 4/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#92400E` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#A16207` | `--color-secondary` |
| On Secondary | `#FFFFFF` | `--color-on-secondary` |
| Accent/CTA | `#6366F1` | `--color-accent` |
| On Accent/CTA | `#000000` | `--color-on-accent` |
| Background | `#FFFBEB` | `--color-background` |
| Foreground | `#0F172A` | `--color-foreground` |
| Card | `#FFFFFF` | `--color-card` |
| Card Foreground | `#0F172A` | `--color-card-foreground` |
| Muted | `#F8F3F0` | `--color-muted` |
| Muted Foreground | `#475569` | `--color-muted-foreground` |
| Border | `#F1E8E2` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| On Destructive | `#FFFFFF` | `--color-on-destructive` |
| Ring | `#92400E` | `--color-ring` |

**Color Notes:** Warm journal brown + ink violet

### Typography

- **Heading Font:** Kalam
- **Body Font:** Patrick Hand
- **Mood:** sketch, hand-drawn, handwriting, human, imperfect, organic, paper, kalam, patrick hand, education, journal, creative
- **Google Fonts:** [Kalam + Patrick Hand](https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=swap)

**CSS Import:**
```css
@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Patrick+Hand&display=swap');
```

### Spacing Variables

*Density: 4/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #6366F1;
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #92400E;
  border: 2px solid #92400E;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFBEB;
  border-radius: 12px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #92400E;
  outline: none;
  box-shadow: 0 0 0 3px #92400E20;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Minimalism & Swiss Style

**Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential

**Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools

**Key Effects:** Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Page Pattern

**Pattern Name:** Scroll-Triggered Storytelling

- **Conversion Strategy:** Keep the narrative understandable without scroll-driven effects. Use progress indicator. Mobile: simplify animations. Keep DOM reading order complete; disable parallax and scroll-scrub under reduced motion. Pause scroll animation when offscreen or hidden and render each chapter in its final readable state under reduced motion.
- **CTA Placement:** End of each chapter (mini) + Final climax CTA
- **Section Order:** Intro hook > Chapter 1 (problem) > Chapter 2 (journey) > Chapter 3 (solution) > Climax CTA

---

## Anti-Patterns (Do NOT Use)

- ❌ Excessive decoration

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
