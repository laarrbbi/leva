# Design system

The design follows the craft rules in
[emilkowalski/skills](https://github.com/emilkowalski/skills) — the
`emil-design-eng` and `apple-design` skills in particular. This document records
what those rules mean here and where each one is enforced, so a later change can
be judged against something rather than against taste.

Everything visual is a token in `src/app/globals.css`. No component invents a
colour, a duration or an easing curve.

---

## The context this is designed for

Someone is standing up, holding a phone in one hand, in a shop, possibly in a
queue. They did not plan to do this. They will leave the moment it feels like
work.

That single fact decides almost everything below: the tap targets, the step
count, the auto-advance, the refusal to ask for an email.

---

## Type

The system font, always. It already ships optical sizing, tracking tables and
legibility tuning that a web font would have to re-earn — and it costs nothing to
download on a shop's patchy wifi.

**Tracking is size-specific.** A single `letter-spacing` value is wrong
somewhere by definition: large text reads too loose at `0`, small text too tight.

| Class | Size | Leading | Tracking | Used for |
| --- | --- | --- | --- | --- |
| `.type-display` | `clamp(1.75rem, 6vw, 2.5rem)` | 1.08 | `-0.028em` | Page titles, the thank-you headline |
| `.type-title` | `clamp(1.25rem, 4vw, 1.5rem)` | 1.2 | `-0.018em` | The question on each step |
| `.type-heading` | 1.0625rem | 1.35 | `-0.011em` | Card titles |
| `.type-body` | 1rem | 1.55 | `0` | Prose |
| `.type-caption` | 0.8125rem | 1.45 | `+0.006em` | Hints, metadata |

Leading moves inversely to size — tight on display, generous on body. Hierarchy
comes from weight, size and leading together, never from size alone.

`.type-numeric` sets tabular figures so a changing number does not jitter its
neighbours as digits swap width.

Spacing is in `rem`, so a larger system text size scales the layout with it
instead of breaking it.

---

## Colour

Defined in OKLCH on bare `:root`, then overridden for dark mode. A colour never
has its only definition inside a media query.

| Token | Role |
| --- | --- |
| `--canvas` | Page ground. A warm off-white, not `#fff` — less glare under shop lighting |
| `--surface` / `--surface-sunken` / `--surface-raised` | Elevation, by fill rather than by border |
| `--ink` / `--ink-muted` / `--ink-subtle` | Three text weights, no more |
| `--brand` | Indigo. Primary actions, the current step |
| `--star` | Amber. Reads as "rating" instantly, with no legend |
| `--positive` / `--caution` / `--critical` | Status, each with a soft companion for backgrounds |

Elevation is semi-transparent shadow, never a solid border. A card should sit on
the page, not be drawn onto it. Three depths: `--shadow-sm`, `--shadow-card`,
`--shadow-lift`.

Dark mode is a real palette, not an inversion: shadows deepen, the brand
lightens to hold contrast on a dark ground.

---

## Motion

### The decision framework

Before anything animates, three questions.

**1. Should it animate at all?** Frequency decides.

| How often the user sees it | Decision |
| --- | --- |
| Hundreds of times a day | Never animate |
| Tens of times a day | Reduce hard, or drop it |
| Occasionally (a step change, a banner) | Standard animation |
| Once (the thank-you screen) | Allowed to delight |

The success check on the thank-you screen draws itself in, because a customer
sees it once. The admin nav has no transition on navigation, because an owner
uses it all day.

**2. What is it for?** Every animation here answers this:

| Animation | Purpose |
| --- | --- |
| `scale(0.97)` on press | Feedback — the interface heard you |
| Step enter | Prevents a jarring swap between questions |
| Progress dot widening | State indication |
| Success check drawing | Completion |
| List stagger | Direction of reading |

Nothing animates because it looks good.

**3. Which curve?** Enter and exit take `ease-out`. On-screen movement takes
`ease-in-out`. **`ease-in` is never used** — it delays the first frame, which is
exactly the frame the user is watching, so a 300 ms `ease-in` *feels* slower than
a 300 ms `ease-out`.

The built-in CSS curves are too weak to read as intentional:

```css
--ease-out-strong:    cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out-strong: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer:        cubic-bezier(0.32, 0.72, 0, 1);
```

### Duration

Ceiling of 300 ms for anything the user triggers.

| Token | Value | Used for |
| --- | --- | --- |
| `--duration-press` | 140 ms | Press feedback — the finger is still down |
| `--duration-hover` | 180 ms | Hover, focus rings |
| `--duration-pop` | 200 ms | Chips, toggles, stars |
| `--duration-step` | 260 ms | Step transitions, stagger |
| `--duration-sheet` | 320 ms | The one exception: large surfaces |

### Rules that are enforced, not suggested

- **Never `scale(0)`.** Nothing in the real world appears out of nothing. Entries
  start at `scale(0.985)` with `opacity: 0`.
- **Only `transform` and `opacity` animate.** They skip layout and paint. The
  one deliberate exception is the dashboard histogram's `width`, which animates
  once on load and must stay pinned to its left edge.
- **Transitions, not keyframes, for anything retriggerable.** A transition
  retargets from its current position; a keyframe restarts from zero.
- **Hover is gated** behind `@media (hover: hover) and (pointer: fine)`. Touch
  devices fire `:hover` on tap and leave the element stuck in that state.
- **Stagger delays are 40 ms.** Long delays read as a slow app, not a cascade.
- **`-webkit-tap-highlight-color: transparent`** on everything pressable, so our
  own feedback is the only thing the customer sees.

### Reduced motion

Reduced motion means *gentler*, not absent. Movement stops; opacity keeps
carrying the state change, because it is what tells the user something happened.

The app also honours `prefers-reduced-transparency` (frosted chrome becomes
solid) and `prefers-contrast: more` (borders and muted text darken).

---

## Components

### Pressable

Every pressable surface gets `.pressable`: `scale(0.97)` on `:active` over
140 ms. It is the cheapest possible way to make an interface feel like it is
listening, and its absence is felt even when its presence is not noticed.

### Stars

A real `<input type="radio">` group with the SVG layered on top. Arrow-key
navigation, tab order, screen-reader announcements and form serialisation all
come from the platform. Rebuilding it with `<div>`s would mean reimplementing
every one of those and getting some of them wrong.

The caption below sits in a fixed-height row, so it appearing never reflows the
stars — a shift there moves the tap target out from under a finger already on
its way down.

### Progress dots

The current step widens into a bar rather than only changing colour. A size
change is legible at a glance and does not depend on colour vision.

### Chrome

Translucent, with content scrolling underneath (`backdrop-filter: blur(20px)
saturate(180%)`), rather than an opaque bar that eats a fixed strip of a phone
screen. Solid under `prefers-reduced-transparency`.

### Focus

One ring, everywhere, `:focus-visible` only — so it appears for keyboard users
and not on a mouse click or a tap, where it reads as a rendering bug.

---

## Accessibility

- Contrast meets WCAG AA in both themes.
- Every interactive element is reachable and operable by keyboard.
- Zoom is not disabled (`maximumScale: 5`). Disabling it is an accessibility
  failure, and the layout tolerates it.
- Status messages use `aria-live="polite"` — announced without stealing focus.
- Icons are `aria-hidden` with a text label beside or a `.sr-only` label within.
- A skip link precedes the main content.
- Minimum tap target is 44×44 px.

---

## Writing

The interface is written for someone standing up.

| Do | Don't |
| --- | --- |
| "How was your visit?" | "Please rate your customer experience" |
| "What should we stock next?" | "Product suggestions" |
| "Only the owner sees this." | "Your data is processed per our policy" |
| "Removed from the list. Their past ratings are kept." | "Operation completed successfully" |

Nav items name their contents — "Wishlist", "Activity" — rather than generic
umbrellas. Specificity is what makes an interface predictable.

Errors say what happened and what to do: "This page has expired. Please scan the
tag again."
