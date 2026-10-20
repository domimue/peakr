import {
  ANKLE_Y as A,
  bar,
  bench,
  cable,
  column,
  db,
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

/** Pull movements and arm isolation. */

const p = (x: number, y: number): Point => [x, y];
const at = (hip: Point, torso: number, dx: number, dy: number): Point => {
  const s = sh(hip, torso);
  return [s[0] + dx, s[1] + dy];
};

const ST = p(58, SY);
const ELBOW_SIDE = 1;

// Hanging from a bar at y 8: start hanging, end chin over the bar.
const hangPull = (endBend: 1 | -1, ...props: Prop[]): FigureDef =>
  fig(
    side(p(60, 67), -90, [61, 9], [50, 102]),
    side(p(60, 48), -90, [62, 9, endBend], [48, 84]),
    frame([30, 8], [92, 8]),
    ...props,
  );

// Bent-over row: hinge with the hands under the shoulders.
const ROW_HIP = p(48, 64);
const bentRow = (...props: Prop[]): FigureDef =>
  fig(
    side(ROW_HIP, -25, at(ROW_HIP, -25, 2, 28), [64, A]),
    side(ROW_HIP, -25, at(ROW_HIP, -25, -10, 15), [64, A]),
    ...props,
  );

// Seated on a machine, hip on a seat at y 80.
const SEATED = p(42, 80);
const seated = (torso: number, startHand: Tgt, endHand: Tgt, ...props: Prop[]): FigureDef =>
  fig(
    side(SEATED, torso, startHand, [66, A]),
    side(SEATED, torso, endHand, [66, A]),
    ...seat(30, 52, 85),
    ...props,
  );

// Lying on a flat bench, head left.
const BENCH_HIP = p(66, 76);
const lying = (startHand: Tgt, endHand: Tgt, ...props: Prop[]): FigureDef =>
  fig(
    side(BENCH_HIP, 180, startHand, [90, A]),
    side(BENCH_HIP, 180, endHand, [90, A]),
    ...bench(22, 74),
    ...props,
  );

// Standing curl: elbow at the side.
const curl = (...props: Prop[]): FigureDef =>
  fig(side(ST, -90, [60, 61], [60, A]), side(ST, -90, [68, 40, ELBOW_SIDE], [60, A]), ...props);

export const PULL_FIGURES: Record<string, FigureDef> = {
  // ---------------------------------------------------------------- horizontal pull
  barbell_row: bentRow(bar),
  t_bar_row: bentRow(
    { kind: 'band', from: [12, 110], to: 'handNear' },
    { kind: 'barbell', at: { joint: 'handNear', dx: 5, dy: 2 } },
  ),
  dumbbell_row: fig(
    side(p(44, 70), -5, [76, 96], [52, A], { handFar: [80, 82], footFar: [20, 80] }),
    side(p(44, 70), -5, [62, 76], [52, A], { handFar: [80, 82], footFar: [20, 80] }),
    pad([14, 84], [86, 84]),
    db,
  ),
  chest_supported_dumbbell_row: fig(
    side(p(42, 86), -50, at(p(42, 86), -50, 4, 28), [22, A]),
    side(p(42, 86), -50, at(p(42, 86), -50, -8, 14), [22, A]),
    pad([36, 98], [70, 60]),
    frame([52, 82], [52, 112]),
    db,
  ),
  seated_cable_row: fig(
    side(p(34, 95), -95, [62, 68], [70, 94], { tilt: -60 }),
    side(p(34, 95), -100, [46, 78], [70, 94], { tilt: -60 }),
    pad([20, 100], [46, 100]),
    pad([78, 84], [78, 102]),
    cable([104, 72]),
    grip,
  ),
  seated_row_machine: seated(-88, [70, 52], [46, 58], pad([56, 42], [56, 70]), grip, column(86)),
  high_row_machine: seated(-92, [60, 26], [52, 52], grip, column(86, 10), {
    kind: 'pad',
    from: { joint: 'kneeNear', dx: -5, dy: -6 },
    to: { joint: 'kneeNear', dx: 5, dy: -6 },
  }),
  single_arm_cable_row: fig(
    side(p(54, SY), -76, at(p(54, SY), -76, 28, 6), [70, A], {
      footFar: [40, 106],
      tiltFar: 35,
      handFar: [68, 64],
    }),
    side(p(54, SY), -80, at(p(54, SY), -80, -6, 22), [70, A], {
      footFar: [40, 106],
      tiltFar: 35,
      handFar: [68, 64],
    }),
    cable([110, 58]),
    grip,
  ),
  inverted_row: fig(
    side(p(54.7, 94.3), -12.2, [88, 61], [10, 106], { tilt: -60 }),
    side(p(49.5, 83), -30, [88, 61], [10, 106], { tilt: -60 }),
    frame([88, 60], [88, 112]),
    grip,
  ),
  face_pull: fig(
    side(ST, -88, [86, 32], [66, A], { footFar: [48, 106], tiltFar: 30 }),
    side(ST, -92, [64, 24, -1], [66, A], { footFar: [48, 106], tiltFar: 30 }),
    cable([108, 30]),
    grip,
  ),
  cable_external_rotation: fig(
    front(ST, [62, 56, 1], [64, A], { handFar: [44, 60, 1] }),
    front(ST, [86, 54, -1], [64, A], { handFar: [44, 60, 1] }),
    cable([10, 56]),
    grip,
  ),
  band_pull_apart: fig(front(ST, [68, 34, 1], [64, A]), front(ST, [96, 36, 1], [64, A]), {
    kind: 'band',
    from: 'handFar',
    to: 'handNear',
  }),

  // ---------------------------------------------------------------- vertical pull
  pull_up: hangPull(1),
  chin_up: hangPull(1),
  band_assisted_pull_up: hangPull(1, { kind: 'band', from: [62, 8], to: 'kneeNear' }),
  lat_pulldown: fig(
    side(p(40, 74), -98, [46, 16], [66, A]),
    side(p(40, 74), -104, [47, 50], [66, A]),
    ...seat(30, 52, 81),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -5, dy: -6 },
      to: { joint: 'kneeNear', dx: 5, dy: -6 },
    },
    frame([78, 112], [78, 6], [46, 6]),
    cable([46, 8]),
    grip,
  ),
  single_arm_lat_pulldown: fig(
    side(p(40, 74), -98, [46, 16], [66, A], { handFar: [56, 74] }),
    side(p(40, 74), -100, [44, 54], [66, A], { handFar: [56, 74] }),
    ...seat(30, 52, 81),
    frame([78, 112], [78, 6], [46, 6]),
    cable([46, 8]),
    grip,
  ),
  machine_pulldown: fig(
    side(p(40, 74), -98, [50, 18], [66, A]),
    side(p(40, 74), -102, [50, 50], [66, A]),
    ...seat(30, 52, 81),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -5, dy: -6 },
      to: { joint: 'kneeNear', dx: 5, dy: -6 },
    },
    column(80, 10),
    grip,
  ),
  assisted_pull_up_machine: fig(
    side(p(60, 70), -90, [61, 12], [36, 84]),
    side(p(60, 52), -90, [62, 12], [36, 66]),
    frame([40, 12], [84, 12]),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -10, dy: 5 },
      to: { joint: 'kneeNear', dx: 6, dy: 5 },
    },
    frame([84, 12], [84, 112]),
  ),
  pullover_machine: seated(
    -92,
    [40, 18, -1],
    [62, 62],
    {
      kind: 'pad',
      from: { joint: 'elbowNear', dx: 3, dy: -5 },
      to: { joint: 'elbowNear', dx: 3, dy: 5 },
    },
    pad([32, 83], [34, 50]),
  ),
  straight_arm_pulldown: fig(
    side(p(52, SY), -76, [84, 14], [64, A]),
    side(p(52, SY), -76, [70, 62], [64, A]),
    cable([104, 8]),
    grip,
  ),
  dumbbell_pullover: lying([10, 80, -1], [38, 50], db),

  // ---------------------------------------------------------------- arms
  biceps_curl: curl(db),
  hammer_curl: curl(db),
  ez_bar_curl: curl(bar),
  cable_curl: curl(cable([84, 106]), grip),
  rope_hammer_curl: curl(cable([84, 106]), grip),
  shrug: fig(side(ST, -90, [60, 61], [60, A]), side(p(58, 60), -90, [60, 58], [60, 105]), db),
  cable_shrug: fig(
    side(ST, -90, [60, 61], [60, A]),
    side(p(58, 60), -90, [60, 58], [60, 105]),
    cable([62, 106]),
    grip,
  ),
  preacher_curl: seated(-85, [76, 70], [58, 40], pad([54, 52], [70, 66]), bar),
  biceps_curl_machine: seated(-85, [76, 70], [58, 40], pad([54, 52], [70, 66]), grip, column(86)),
  concentration_curl: fig(
    side(p(40, 80), -55, at(p(40, 80), -55, 6, 28), [66, A]),
    side(p(40, 80), -55, at(p(40, 80), -55, 8, 4), [66, A]),
    ...seat(26, 48, 85),
    db,
  ),
  incline_dumbbell_curl: fig(
    side(p(56, 84), -125, at(p(56, 84), -125, 0, 28), [82, A]),
    side(p(56, 84), -125, at(p(56, 84), -125, 10, 8), [82, A]),
    pad([30, 50], [56, 88]),
    pad([54, 91], [70, 91]),
    frame([60, 94], [60, 112]),
    db,
  ),
  triceps_pushdown: fig(
    side(ST, -88, [68, 44], [60, A]),
    side(ST, -88, [64, 61], [60, A]),
    cable([84, 6]),
    grip,
  ),
  overhead_triceps_extension: fig(
    side(ST, -90, [50, 24, -1], [60, A]),
    side(ST, -90, [61, 6], [60, A]),
    db,
  ),
  cable_overhead_triceps_extension: fig(
    side(p(54, SY), -70, at(p(54, SY), -70, -8, -10), [72, A], { footFar: [40, 106], tiltFar: 35 }),
    side(p(54, SY), -70, at(p(54, SY), -70, 22, -18), [72, A], { footFar: [40, 106], tiltFar: 35 }),
    cable([8, 96]),
    grip,
  ),
  cable_triceps_kickback: fig(
    side(p(50, 64), -20, at(p(50, 64), -20, -4, 22), [64, A]),
    side(p(50, 64), -20, at(p(50, 64), -20, -26, 8), [64, A]),
    cable([108, 106]),
    grip,
  ),
  skull_crusher: lying([38, 48], [24, 60, -1], bar),
  triceps_extension_machine: seated(
    -92,
    [58, 34, -1],
    [72, 58],
    pad([48, 52], [62, 52]),
    grip,
    column(86),
  ),
  seated_dip_machine: seated(-92, [46, 58], [42, 78], grip),
};
