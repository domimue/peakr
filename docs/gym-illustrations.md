# Gym: exercise figures and illustrations

Every library exercise has its own **figure**: a stick figure in the Peakr line style, drawn from our
own pose data – no images or pose data from another app or website.

- Code: `apps/mobile/src/features/gym/figures/`
  - `skeleton.ts` – the figure (segment lengths, side and front view) and the two-bone inverse
    kinematics that places elbows and knees, so limbs keep their length in every pose.
  - `render.ts` – turns a figure into an SVG string: start position faint, working position solid,
    equipment (plates, bench, seat, pads, cables, frames) in the muted colour.
  - `helpers.ts` – short-hands for writing poses (`side`, `front`, `seat`, `bench`, …).
  - `poses-*.ts` – one entry per exercise, grouped by body region; `poses.ts` merges them.
  - `exercise-figure.tsx` – the React Native component (`SvgXml`), coloured from the theme.
- Side views face right; front views are used where the movement happens sideways (lateral raises,
  flys, abduction / adduction).
- Custom exercises copied from a library exercise use the figure of that exercise (`basedOn`); other
  custom exercises show the symbol of their movement pattern.
- `__tests__/figures.test.ts` checks that every library exercise has a figure, that no hand or foot
  target is far out of reach, that every pose stays inside the 120 × 120 box, and that the SVG holds
  no hard-coded colours.

## Adding a new exercise

Add its entry to the matching `poses-*.ts` file (reuse a helper such as `seated`, `lying` or
`squat` where possible) and run the figure test. To look at the result, render
`figureSvg(def, colours)` into an HTML page.

## Replacing figures with real illustrations later

1. **Source and licence first.** Our own drawings, commissioned work we own, or a source whose
   licence allows commercial use in an app. Never images out of another gym app or website. Record
   source and licence in a `LICENSES.md` next to the assets.
2. **Format.** One SVG per exercise (monochrome, `currentColor`, viewBox 0 0 120 120) or a still
   WebP at 2× / 3×; same framing for all, no baked-in colours.
3. **Hook-up.** Set `illustration: "<asset-key>"` on the exercise in `exercises.json` and let
   `ExerciseFigure` prefer the illustration when the key is set, keeping the figure as fallback.
4. **Accessibility.** Figures and illustrations are decorative; name, instructions and cues stay the
   accessible description.
