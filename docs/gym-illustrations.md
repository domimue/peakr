# Gym: exercise illustrations (slot for later)

The exercise library (`packages/engine/src/plan/library/exercises.json`, texts in
`apps/mobile/src/i18n/locales/en/exercises.json`) ships **without images**. Until real
illustrations exist, every exercise shows the symbol of its **movement pattern**
(`PATTERN_ICONS` in `apps/mobile/src/features/gym/exercise-text.ts`, symbols defined in
`apps/mobile/src/ui/components/icon.tsx` as `pattern*`). Push and pull patterns use arrows in the
direction of the movement, so the set reads as one consistent diagram family.

## Adding real illustrations

1. **Source and licence first.** Only our own drawings, commissioned work we own, or a source whose
   licence allows commercial use in an app (check attribution and share-alike terms). Never take
   images, animations or videos out of another gym app or website. Record the source and licence of
   every set in a `LICENSES.md` next to the assets.
2. **Format.** One SVG per exercise (monochrome, `currentColor`, viewBox 0 0 120 120, stroke style
   matching the Peakr mark), or a still WebP at 2× / 3×. Same framing for every image, light and dark
   theme handled by `currentColor` (no baked-in colours, no hex values outside `/packages/theme`).
3. **Where.** `apps/mobile/assets/exercises/<exercise-id>.svg`, registered in a single map
   `apps/mobile/src/features/gym/illustrations.ts` (`Record<string, ComponentType>` for SVGs via
   `react-native-svg`, or `require()` for raster files) so Metro bundles them.
4. **Hook-up.** Set `illustration: "<asset-key>"` on the exercise in `exercises.json` (validated by
   `parseExerciseRecords`). `ExerciseDetailScreen` and `ExerciseRow` already render the pattern icon
   in the spot where the illustration goes – replace that with the illustration when the key is set
   and keep the pattern icon as the fallback.
5. **Accessibility.** Illustrations are decorative; the name, instructions and cues stay the
   accessible description.

Custom exercises have no illustration slot; they always use the pattern icon.
