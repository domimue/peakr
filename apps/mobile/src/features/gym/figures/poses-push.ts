import {
  ANKLE_Y as A,
  bar,
  bench,
  cable,
  column,
  db,
  dbFar,
  fig,
  frame,
  front,
  grip,
  pad,
  seat,
  sh,
  side,
  STAND_Y as SY,
  type Tgt,
} from './helpers';
import type { FigureDef, Prop } from './render';
import type { Point } from './skeleton';

/** Push movements, flys and shoulder work. */

const p = (x: number, y: number): Point => [x, y];
const at = (hip: Point, torso: number, dx: number, dy: number): Point => {
  const s = sh(hip, torso);
  return [s[0] + dx, s[1] + dy];
};

// Lying on a flat bench, head left; shoulder at about x 36.
const BENCH_HIP = p(66, 76);
const lying = (startHand: Tgt, endHand: Tgt, ...props: Prop[]): FigureDef =>
  fig(
    side(BENCH_HIP, 180, startHand, [90, A]),
    side(BENCH_HIP, 180, endHand, [90, A]),
    ...bench(22, 74),
    ...props,
  );

// Incline bench (about 30°), seat at the hip.
const INC_HIP = p(58, 84);
const incline = (startHand: Tgt, endHand: Tgt, ...props: Prop[]): FigureDef =>
  fig(
    side(INC_HIP, -145, startHand, [84, A]),
    side(INC_HIP, -145, endHand, [84, A]),
    pad([28, 62], [56, 86]),
    pad([54, 89], [70, 89]),
    frame([60, 92], [60, 112]),
    ...props,
  );

// Seated upright on a machine or bench with a backrest.
const SEATED = p(42, 80);
const seated = (startHand: Tgt, endHand: Tgt, torso = -92, ...props: Prop[]): FigureDef =>
  fig(
    side(SEATED, torso, startHand, [64, A]),
    side(SEATED, torso, endHand, [64, A]),
    ...seat(30, 52, 85),
    pad([32, 83], [34, 50]),
    ...props,
  );

// Push-up: body straight from the ankle (x 16) to the shoulder above the hands.
const pushUp = (
  top: { hip: Point; torso: number },
  low: { hip: Point; torso: number },
  hand: Point,
  foot: Point,
  ...props: Prop[]
) =>
  fig(
    side(top.hip, top.torso, hand, foot, { tilt: 60 }),
    side(low.hip, low.torso, hand, foot, { tilt: 60 }),
    ...props,
  );

// Standing tall at x 58.
const ST = p(58, SY);
const STAND_SHOULDER = sh(ST, -90);

export const PUSH_FIGURES: Record<string, FigureDef> = {
  // ---------------------------------------------------------------- horizontal push
  bench_press: lying([38, 48], [40, 66], bar),
  close_grip_bench_press: lying([38, 48], [42, 67], bar),
  dumbbell_press: lying([38, 48], [42, 68], db),
  smith_bench_press: lying([38, 48], [40, 66], bar, frame([40, 4], [40, 112])),
  incline_press: incline([42, 44], [40, 62], bar),
  smith_incline_press: incline([42, 44], [40, 62], bar, frame([42, 4], [42, 112])),
  push_up: pushUp(
    { hip: p(59, 89.7), torso: -20.8 },
    { hip: p(61, 97.5), torso: -10.6 },
    [87, A],
    [16, 106],
  ),
  feet_elevated_push_up: pushUp(
    { hip: p(60, 81), torso: -3.8 },
    { hip: p(60, 88.8), torso: 6 },
    [89, A],
    [14, 84],
    frame([4, 86], [26, 86], [26, 112]),
  ),
  archer_push_up: fig(
    side(p(59, 89.7), -20.8, [87, A], [16, 106], { tilt: 60, handFar: [110, A] }),
    side(p(61, 97.5), -10.6, [87, A], [16, 106], { tilt: 60, handFar: [110, A] }),
  ),
  dips: fig(
    side(p(56, 62), -86, [60, 62], [48, 96, 1]),
    side(p(54, 76), -76, [64, 64], [44, 104, 1]),
    frame([46, 64], [80, 64]),
    frame([76, 64], [76, 112]),
  ),
  assisted_dip_machine: fig(
    side(p(56, 64), -86, [60, 64], [36, 84]),
    side(p(54, 78), -76, [64, 66], [34, 98]),
    frame([46, 66], [80, 66]),
    frame([76, 66], [76, 112]),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -8, dy: 5 },
      to: { joint: 'kneeNear', dx: 6, dy: 5 },
    },
  ),
  chest_press_machine: seated([52, 48], [70, 48], -92, grip, column(86)),
  incline_chest_press_machine: seated([52, 44], [64, 26], -92, grip, column(86)),
  decline_chest_press_machine: seated([52, 54], [70, 62], -92, grip, column(86)),
  cable_chest_press: fig(
    side(p(56, SY), -84, at(p(56, SY), -84, 8, 12), [70, A], { footFar: [40, 106], tiltFar: 35 }),
    side(p(56, SY), -84, at(p(56, SY), -84, 28, 4), [70, A], { footFar: [40, 106], tiltFar: 35 }),
    cable([8, 40]),
    grip,
  ),

  // ---------------------------------------------------------------- vertical push
  overhead_press: fig(
    side(ST, -90, [STAND_SHOULDER[0] + 8, STAND_SHOULDER[1] + 1], [60, A]),
    side(ST, -90, [60, 8], [60, A]),
    bar,
  ),
  smith_shoulder_press: seated([54, 52], [48, 24], -92, bar, frame([52, 4], [52, 112])),
  dumbbell_shoulder_press: seated([52, 48], [46, 24], -92, db),
  arnold_press: seated([54, 40], [46, 24], -92, db),
  shoulder_press_machine: seated([52, 48], [46, 24], -92, grip, column(22, 10)),
  landmine_press: fig(
    side(p(56, SY), -82, at(p(56, SY), -82, 8, 2), [72, A], { footFar: [42, 106], tiltFar: 35 }),
    side(p(56, SY), -82, at(p(56, SY), -82, 22, -18), [72, A], { footFar: [42, 106], tiltFar: 35 }),
    { kind: 'band', from: [18, 110], to: 'handNear' },
    { kind: 'barbell', at: { joint: 'handNear', dx: 3, dy: -3 } },
  ),
  pike_push_up: fig(
    side(p(54, 62), 47, [86, A], [30, A], { tilt: 60 }),
    side(p(58, 66), 52, [88, A], [30, A], { tilt: 60 }),
  ),
  lateral_raise: fig(front(ST, [72, 60], [64, A]), front(ST, [94, 36], [64, A]), db, dbFar),
  lateral_raise_machine: fig(
    front(p(60, 80), [74, 66], [70, A]),
    front(p(60, 80), [96, 50], [70, A]),
    {
      kind: 'pad',
      from: { joint: 'elbowNear', dx: 3, dy: -5 },
      to: { joint: 'elbowNear', dx: 3, dy: 5 },
    },
    {
      kind: 'pad',
      from: { joint: 'elbowFar', dx: -3, dy: -5 },
      to: { joint: 'elbowFar', dx: -3, dy: 5 },
    },
    pad([44, 84], [76, 84]),
  ),
  cable_lateral_raise: fig(
    front(ST, [56, 62], [64, A], { handFar: [36, 46, 1] }),
    front(ST, [94, 36], [64, A], { handFar: [36, 46, 1] }),
    frame([30, 40], [30, 112]),
    cable([30, 104]),
    grip,
  ),
  cable_y_raise: fig(
    front(ST, [56, 64], [64, A], { handFar: [62, 64, 1] }),
    front(ST, [90, 8], [64, A]),
    cable([108, 104]),
    cable([12, 104], 'handFar'),
  ),
  cable_front_raise: fig(
    side(ST, -90, [64, 60], [60, A]),
    side(ST, -90, [86, 32], [60, A]),
    cable([42, 106]),
    grip,
  ),
  upright_row: fig(side(ST, -90, [62, 62], [60, A]), side(ST, -90, [64, 42, -1], [60, A]), bar),
  cable_upright_row: fig(
    side(ST, -90, [62, 62], [60, A]),
    side(ST, -90, [64, 42, -1], [60, A]),
    cable([62, 106]),
    grip,
  ),

  // ---------------------------------------------------------------- fly
  pec_deck: fig(
    front(p(60, 80), [94, 46, 1], [70, A]),
    front(p(60, 80), [66, 54, -1], [70, A]),
    pad([44, 84], [76, 84]),
    grip,
    { kind: 'grip', at: 'handFar' },
  ),
  rear_delt_fly_machine: fig(
    front(p(60, 80), [66, 52, -1], [70, A]),
    front(p(60, 80), [96, 48, 1], [70, A]),
    pad([44, 84], [76, 84]),
    grip,
    { kind: 'grip', at: 'handFar' },
  ),
  cable_fly: fig(
    front(ST, [94, 30, 1], [64, A]),
    front(ST, [64, 62, -1], [64, A]),
    cable([110, 8]),
    cable([10, 8], 'handFar'),
  ),
  low_cable_fly: fig(
    front(ST, [84, 58, 1], [64, A]),
    front(ST, [64, 44, -1], [64, A]),
    cable([110, 106]),
    cable([10, 106], 'handFar'),
  ),
  cable_rear_delt_fly: fig(
    front(ST, [52, 46, 1], [64, A]),
    front(ST, [96, 40, 1], [64, A]),
    cable([10, 40]),
    cable([110, 40], 'handFar'),
  ),
  band_chest_fly: fig(front(ST, [94, 34, 1], [64, A]), front(ST, [64, 42, -1], [64, A]), {
    kind: 'band',
    from: 'handFar',
    to: 'handNear',
  }),
  dumbbell_fly: lying([38, 48], [38, 74, -1], db),
  dumbbell_rear_delt_fly: fig(
    side(p(48, 66), -18, at(p(48, 66), -18, 2, 28), [62, A]),
    side(p(48, 66), -18, at(p(48, 66), -18, -2, 10), [62, A]),
    db,
  ),
};
