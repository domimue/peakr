import {
  ANKLE_Y as A,
  cable,
  fig,
  frame,
  front,
  grip,
  hold,
  pad,
  seat,
  sh,
  side,
  STAND_Y as SY,
  type Tgt,
} from './helpers';
import type { FigureDef } from './render';
import type { Point } from './skeleton';

/** Core and mobility. */

const p = (x: number, y: number): Point => [x, y];
const at = (hip: Point, torso: number, dx: number, dy: number): Point => {
  const s = sh(hip, torso);
  return [s[0] + dx, s[1] + dy];
};

const ST = p(58, SY);
// Lying on the back on the floor, head left.
const FLOOR_HIP = p(62, 103);
// On all fours, head left: hands under the shoulders, knees under the hips.
const QUAD_HIP = p(70, 82);
const quad = (hand: Tgt, foot: Tgt, more: Parameters<typeof side>[4] = {}) =>
  side(QUAD_HIP, 180, hand, foot, { toes: 1, tilt: 0, ...more });

// Forearm plank: body straight from the ankle (x 12) to the shoulder above the elbow.
const PLANK = side(p(57.2, 97.4), -10.7, [100, 106], [12, 106], { tilt: 60 });
// Hanging from a bar at y 8.
const HANG_HIP = p(60, 67);

export const CORE_FIGURES: Record<string, FigureDef> = {
  plank: hold(PLANK),
  side_plank: hold(
    side(p(57.2, 97.4), -10.7, [100, 106], [12, 106], { tilt: 60, handFar: [62, 92] }),
  ),
  copenhagen_plank: hold(
    side(p(63, 88.6), 10.7, [104, 106], [18, 80], { footFar: [58, 106], tilt: 0 }),
    frame([8, 82], [30, 82], [30, 112]),
  ),
  dead_bug: fig(
    side(FLOOR_HIP, 180, [34, 76], [82, 82]),
    side(FLOOR_HIP, 180, [8, 98, -1], [82, 82], { footFar: [106, 98] }),
  ),
  bird_dog: fig(quad([40, 106], [94, 104]), quad([12, 80, -1], [94, 104], { footFar: [112, 80] })),
  pallof_press: fig(
    side(ST, -90, at(ST, -90, 8, 14), [64, A]),
    side(ST, -90, at(ST, -90, 28, 12), [64, A]),
    grip,
  ),
  hanging_knee_raise: fig(
    side(HANG_HIP, -90, [61, 9], [60, 108]),
    side(HANG_HIP, -90, [61, 9], [72, 76]),
    frame([30, 8], [92, 8]),
  ),
  hanging_leg_raise: fig(
    side(HANG_HIP, -90, [61, 9], [60, 108]),
    side(HANG_HIP, -92, [61, 9], [104, 62], { tilt: -80 }),
    frame([30, 8], [92, 8]),
  ),
  ab_wheel: fig(
    side(p(44, 90), -40, [70, 100], [14, 104], { toes: -1 }),
    side(p(56, 92), -12, [100, 102], [14, 104], { toes: -1 }),
    { kind: 'dumbbell', at: { joint: 'handNear', dy: 2 } },
  ),
  ab_crunch_machine: fig(
    side(p(42, 80), -95, at(p(42, 80), -95, 6, -2), [64, A]),
    side(p(42, 80), -55, at(p(42, 80), -55, 4, -4), [64, A]),
    ...seat(30, 52, 85),
    {
      kind: 'pad',
      from: { joint: 'shoulder', dx: 6, dy: -4 },
      to: { joint: 'shoulder', dx: 6, dy: 6 },
    },
  ),
  torso_rotation_machine: fig(
    front(p(60, 80), [66, 52, 1], [70, A]),
    front(p(60, 80), [82, 52, -1], [70, A], { handFar: [64, 54, 1] }),
    pad([44, 84], [76, 84]),
    grip,
  ),
  neck_extension_machine: fig(
    side(p(42, 80), -92, [52, 76], [64, A], { neck: -55 }),
    side(p(42, 80), -92, [52, 76], [64, A], { neck: -100 }),
    ...seat(30, 52, 85),
    { kind: 'pad', from: { joint: 'head', dx: -7, dy: -4 }, to: { joint: 'head', dx: -7, dy: 4 } },
  ),
  neck_flexion_machine: fig(
    side(p(42, 80), -92, [52, 76], [64, A], { neck: -100 }),
    side(p(42, 80), -92, [52, 76], [64, A], { neck: -50 }),
    ...seat(30, 52, 85),
    { kind: 'pad', from: { joint: 'head', dx: 7, dy: -4 }, to: { joint: 'head', dx: 7, dy: 4 } },
  ),
  cable_crunch: fig(
    side(p(58, 84), -82, at(p(58, 84), -82, 4, -6), [34, 104], { toes: -1 }),
    side(p(58, 84), -20, at(p(58, 84), -20, 2, -6), [34, 104], { toes: -1 }),
    cable([84, 6]),
    grip,
  ),
  cable_woodchop: fig(
    front(ST, [84, 22, 1], [70, A], { handFar: [80, 24, 1] }),
    front(ST, [46, 62, 1], [70, A], { handFar: [44, 62, 1] }),
    cable([110, 8]),
  ),
  cable_lift: fig(
    front(ST, [74, 62, 1], [70, A], { handFar: [72, 62, 1] }),
    front(ST, [36, 14, 1], [70, A], { handFar: [34, 16, 1] }),
    cable([110, 106]),
  ),
  crunch: fig(
    side(FLOOR_HIP, 180, at(FLOOR_HIP, 180, -4, -8), [84, A]),
    side(FLOOR_HIP, 200, at(FLOOR_HIP, 200, -2, -9), [84, A]),
  ),
  reverse_crunch: fig(
    side(FLOOR_HIP, 180, [40, 107, -1], [82, 82]),
    side(p(60, 98), 172, [40, 107, -1], [52, 72]),
  ),
  russian_twist: fig(
    side(p(60, 103), -125, at(p(60, 103), -125, 14, 14), [86, 100]),
    side(p(60, 103), -125, at(p(60, 103), -125, 24, 6), [86, 100]),
  ),
  hollow_hold: hold(side(FLOOR_HIP, 190, [8, 90], [106, 94], { tilt: 0 })),
  turkish_get_up: fig(
    side(FLOOR_HIP, 180, [32, 76], [86, A], { handFar: [44, 107, -1] }),
    side(FLOOR_HIP, -125, at(FLOOR_HIP, -125, 0, -28), [86, A], { handFar: [30, 107, -1] }),
    { kind: 'kettlebell', at: { joint: 'handNear', dy: -11 } },
  ),

  // ---------------------------------------------------------------- mobility
  hip_flexor_stretch: fig(
    side(p(50, 84), -90, [74, 84], [80, A], { footFar: [24, 106], toes: 1 }),
    side(p(56, 86), -96, [78, 84], [80, A], { footFar: [24, 106] }),
  ),
  ankle_dorsiflexion: fig(
    side(p(50, 84), -90, [76, 82], [76, A], { footFar: [24, 106] }),
    side(p(58, 86), -86, [82, 82], [76, A], { footFar: [30, 106] }),
    frame([98, 20], [98, 112]),
  ),
  thoracic_rotation: fig(
    quad([40, 106], [94, 104], { handFar: [32, 76] }),
    quad([40, 106], [94, 104], { handFar: [44, 52] }),
  ),
  hips_90_90: fig(
    side(p(56, 103), -90, [40, 107], [80, 106], { footFar: [32, 106, 1] }),
    side(p(56, 103), -90, [72, 107], [32, 106, 1], { footFar: [80, 106, -1] }),
  ),
  hamstring_floss: fig(
    side(FLOOR_HIP, 180, [52, 82], [66, 66], { footFar: [106, 106] }),
    side(FLOOR_HIP, 180, [52, 82], [76, 58], { footFar: [106, 106], tilt: -80 }),
  ),
  worlds_greatest_stretch: fig(
    side(p(52, 90), -25, [80, 106], [86, A], { footFar: [16, 104], handFar: [74, 106] }),
    side(p(52, 90), -25, [80, 106], [86, A], { footFar: [16, 104], handFar: [72, 50, -1] }),
  ),
  cat_cow: fig(
    quad([40, 106], [94, 104], { neck: 135 }),
    quad([40, 106], [94, 104], { neck: 215 }),
  ),
  pigeon_stretch: fig(
    side(p(52, 96), -80, [60, 94], [76, 104], { footFar: [8, 106] }),
    side(p(52, 96), -20, [96, 107], [76, 104], { footFar: [8, 106] }),
  ),
};
