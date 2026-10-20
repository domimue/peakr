import {
  ANKLE_Y as A,
  bar,
  bench,
  box,
  cable,
  db,
  dbFar,
  fig,
  frame,
  front,
  grip,
  hold,
  kb,
  pad,
  seat,
  sh,
  side,
  STAND_Y as SY,
} from './helpers';
import type { FigureDef } from './render';
import type { Point } from './skeleton';

/** Lower body: squat, hinge, lunge, calf, leg isolation and plyometrics (side view facing right). */

const p = (x: number, y: number): Point => [x, y];
/** Hands hanging straight down from the shoulder. */
const hang = (hip: Point, torso: number, dx = 1): Point => {
  const s = sh(hip, torso);
  return [s[0] + dx, s[1] + 28];
};
const onShoulder = (hip: Point, torso: number, dx: number, dy: number): Point => {
  const s = sh(hip, torso);
  return [s[0] + dx, s[1] + dy];
};

// Squat: standing → bottom, feet at x 60.
const SQ_TOP = p(58, SY);
const SQ_LOW = p(45, 85);

function squat(
  lowTorso: number,
  hands: (hip: Point, torso: number) => Point,
  ...props: FigureDef['props']
): FigureDef {
  return fig(
    side(SQ_TOP, -87, hands(SQ_TOP, -87), [60, A]),
    side(SQ_LOW, lowTorso, hands(SQ_LOW, lowTorso), [60, A]),
    ...props,
  );
}

// Leg press (45° sled): reclined, feet on the platform.
const LP_HIP = p(42, 96);
const legPress = (
  startFoot: Point,
  endFoot: Point,
  more: { footFar?: [number, number]; tilt?: number; tiltEnd?: number } = {},
) =>
  fig(
    side(LP_HIP, -150, [46, 98], startFoot, {
      tilt: more.tilt ?? -110,
      ...(more.footFar ? { footFar: more.footFar } : {}),
    }),
    side(LP_HIP, -150, [46, 98], endFoot, {
      tilt: more.tiltEnd ?? more.tilt ?? -110,
      ...(more.footFar ? { footFar: more.footFar } : {}),
    }),
    pad([14, 82], [40, 102]),
    frame([52, 108], [100, 60]),
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: -5, dy: -7 },
      to: { joint: 'ankleNear', dx: 7, dy: 5 },
    },
  );

// Seated machines: hip on a seat at y 80.
const SEAT_HIP = p(38, 75);

export const LEG_FIGURES: Record<string, FigureDef> = {
  // ---------------------------------------------------------------- squat
  back_squat: squat(-62, (h, t) => onShoulder(h, t, -4, 0), {
    kind: 'barbell',
    at: { joint: 'shoulder', dx: -4, dy: 1 },
  }),
  front_squat: squat(-74, (h, t) => onShoulder(h, t, 7, 1), {
    kind: 'barbell',
    at: { joint: 'shoulder', dx: 6, dy: -1 },
  }),
  goblet_squat: squat(-70, (h, t) => onShoulder(h, t, 9, 10), db),
  bodyweight_squat: squat(-60, (h, t) => onShoulder(h, t, 28, 0)),
  smith_squat: fig(
    side(p(56, SY), -88, onShoulder(p(56, SY), -88, -4, 0), [64, A]),
    side(p(44, 85), -66, onShoulder(p(44, 85), -66, -4, 0), [64, A]),
    frame([52, 4], [52, 112]),
    { kind: 'barbell', at: { joint: 'shoulder', dx: -4, dy: 1 } },
  ),
  hack_squat: fig(
    side(p(54, SY), -100, onShoulder(p(54, SY), -100, 3, 4), [66, A]),
    side(p(42, 84), -106, onShoulder(p(42, 84), -106, 3, 4), [66, A]),
    frame([24, 112], [44, 14]),
    {
      kind: 'pad',
      from: { joint: 'hip', dx: -5, dy: 2 },
      to: { joint: 'shoulder', dx: -5, dy: -2 },
    },
  ),
  belt_squat: squat(
    -76,
    (h, t) => onShoulder(h, t, 10, 18),
    { kind: 'kettlebell', at: { joint: 'hip', dy: 12 } },
    pad([40, 110], [84, 110]),
  ),
  wall_sit: hold(side(p(40, 85), -90, [52, 82], [64, A]), frame([33, 4], [33, 112])),
  leg_press: legPress([62, 74], [76, 58]),
  single_leg_press: legPress([62, 74], [76, 58], { footFar: [58, 104] }),
  seated_leg_press: fig(
    side(p(40, 80), -110, [44, 82], [62, 78], { tilt: -80 }),
    side(p(40, 80), -110, [44, 82], [84, 78], { tilt: -80 }),
    pad([26, 86], [50, 86]),
    pad([28, 84], [20, 54]),
    frame([38, 89], [38, 112]),
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: 6, dy: -10 },
      to: { joint: 'ankleNear', dx: 6, dy: 8 },
    },
  ),
  split_squat: fig(
    side(p(56, 64), -90, hang(p(56, 64), -90), [76, A], { footFar: [36, 106], tiltFar: 35 }),
    side(p(56, 82), -90, hang(p(56, 82), -90), [76, A], { footFar: [36, 106], tiltFar: 35 }),
  ),
  bulgarian_split_squat: fig(
    side(p(60, 66), -86, hang(p(60, 66), -86), [78, A], { footFar: [32, 84], tiltFar: 40 }),
    side(p(57, 83), -78, hang(p(57, 83), -78), [78, A], { footFar: [32, 84], tiltFar: 40 }),
    ...bench(14, 38, 88),
    db,
  ),

  // ---------------------------------------------------------------- hinge
  deadlift: fig(
    side(p(44, 84), -35, [68, 99], [62, A]),
    side(p(58, SY), -90, [60, 61], [62, A]),
    bar,
  ),
  trap_bar_deadlift: fig(
    side(p(46, 86), -55, hang(p(46, 86), -55), [62, A]),
    side(p(58, SY), -90, hang(p(58, SY), -90), [62, A]),
    bar,
  ),
  sumo_deadlift: fig(front(p(60, 82), [66, 80], [80, A]), front(p(60, 64), [66, 62], [80, A]), {
    kind: 'barFront',
  }),
  romanian_deadlift: fig(
    side(p(58, SY), -90, [60, 61], [62, A]),
    side(p(48, 65), -22, hang(p(48, 65), -22, 0), [62, A]),
    bar,
  ),
  good_morning: fig(
    side(p(58, SY), -90, onShoulder(p(58, SY), -90, -4, 0), [62, A]),
    side(p(48, 65), -14, onShoulder(p(48, 65), -14, -2, -6), [62, A]),
    { kind: 'barbell', at: { joint: 'shoulder', dx: -1, dy: -7 } },
  ),
  single_leg_rdl: fig(
    side(p(58, SY), -90, hang(p(58, SY), -90), [60, A], { footFar: [50, 102] }),
    side(p(56, 66), -6, hang(p(56, 66), -6, 0), [60, A], { footFar: [12, 64], tiltFar: 90 }),
    db,
  ),
  kettlebell_swing: fig(
    side(p(46, 68), -38, [60, 76], [62, A]),
    side(p(58, SY), -92, [86, 38], [62, A]),
    kb,
  ),
  cable_pull_through: fig(
    side(p(54, 68), -35, [56, 76], [64, A]),
    side(p(60, SY), -90, [64, 64], [64, A]),
    cable([10, 104]),
    grip,
  ),
  hip_thrust: fig(
    side(p(48, 98), -143, [48, 92], [74, A]),
    side(p(52, 77), 180, [52, 71], [74, A]),
    pad([10, 82], [32, 82]),
    frame([20, 85], [20, 112]),
    { kind: 'barbell', at: { joint: 'hip', dy: -7 } },
  ),
  hip_thrust_machine: fig(
    side(p(48, 98), -143, [48, 90], [74, A]),
    side(p(52, 77), 180, [52, 69], [74, A]),
    pad([10, 82], [32, 82]),
    frame([20, 85], [20, 112]),
    { kind: 'pad', from: { joint: 'hip', dx: -6, dy: -6 }, to: { joint: 'hip', dx: 6, dy: -6 } },
    frame([60, 112], [60, 60]),
  ),
  glute_bridge: fig(
    side(p(54, 104), 180, [40, 107, -1], [76, A]),
    side(p(56, 88), 152, [40, 107, -1], [76, A]),
  ),
  back_extension_machine: fig(
    side(SEAT_HIP, -60, [50, 70], [62, A]),
    side(SEAT_HIP, -100, [44, 64], [62, A]),
    ...seat(28, 50, 80),
    {
      kind: 'pad',
      from: { joint: 'shoulder', dx: -6, dy: 0 },
      to: { joint: 'shoulder', dx: -6, dy: 10 },
    },
  ),
  hyperextension: fig(
    side(p(54, 74), 80, [62, 104, -1], [22, 104], { toes: -1, footFar: [22, 104] }),
    side(p(54, 74), -43, [68, 62], [22, 104], { toes: -1, footFar: [22, 104] }),
    pad([48, 84], [62, 72]),
    pad([14, 108], [28, 100]),
    frame([24, 110], [56, 80]),
  ),
  reverse_hyperextension: fig(
    side(p(60, 70), 180, [24, 82], [66, 102], { tilt: 90 }),
    side(p(60, 70), 180, [24, 82], [104, 68]),
    pad([18, 76], [62, 76]),
    frame([24, 79], [24, 112]),
    frame([56, 79], [56, 112]),
  ),

  // ---------------------------------------------------------------- lunge
  walking_lunge: fig(
    side(p(50, SY), -90, hang(p(50, SY), -90), [52, A]),
    side(p(58, 84), -90, hang(p(58, 84), -90), [80, A], { footFar: [38, 106], tiltFar: 35 }),
  ),
  reverse_lunge: fig(
    side(p(64, SY), -90, hang(p(64, SY), -90), [66, A]),
    side(p(54, 84), -90, hang(p(54, 84), -90), [72, A], { footFar: [34, 106], tiltFar: 35 }),
  ),
  step_up: fig(
    side(p(48, SY), -86, hang(p(48, SY), -86), [74, 92], { footFar: [48, A] }),
    side(p(74, 48), -90, hang(p(74, 48), -90), [76, 92], { footFar: [70, 92] }),
    box(60, 94, 34),
  ),
  lateral_lunge: fig(
    front(p(60, SY), [64, 46], [72, A]),
    front(p(72, 82), [76, 60], [84, A], { footFar: [36, A, 1], handFar: [68, 60, 1], torso: -82 }),
  ),
  pistol_squat_progression: fig(
    side(p(56, SY), -90, onShoulder(p(56, SY), -90, 28, 2), [58, A], { footFar: [80, 84] }),
    side(p(46, 92), -58, onShoulder(p(46, 92), -58, 28, 0), [58, A], { footFar: [92, 92] }),
  ),

  // ---------------------------------------------------------------- calf
  standing_calf_raise: fig(
    side(p(58, 59), -90, hang(p(58, 59), -90), [60, 104], { tilt: -18 }),
    side(p(58, 52), -90, hang(p(58, 52), -90), [60, 97], { tilt: 45 }),
    box(60, 106, 30),
  ),
  bent_knee_calf_raise: fig(
    side(p(52, 66), -80, onShoulder(p(52, 66), -80, 24, 4), [60, 104], { tilt: -18 }),
    side(p(52, 59), -80, onShoulder(p(52, 59), -80, 24, 4), [60, 97], { tilt: 45 }),
    box(60, 106, 30),
  ),
  seated_calf_raise: fig(
    side(SEAT_HIP, -90, [52, 70], [62, 102], { tilt: -18 }),
    side(SEAT_HIP, -90, [52, 70], [62, 96], { tilt: 40 }),
    ...seat(26, 50, 80),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -6, dy: -6 },
      to: { joint: 'kneeNear', dx: 4, dy: -6 },
    },
  ),
  leg_press_calf_raise: legPress([76, 58], [78, 56], { tilt: -140, tiltEnd: -80 }),
  tibialis_raise: fig(
    side(p(42, 64), -100, hang(p(42, 64), -100), [66, A]),
    side(p(42, 64), -100, hang(p(42, 64), -100), [66, A], { tilt: -40 }),
    frame([33, 4], [33, 112]),
  ),
  single_leg_hops: fig(
    side(p(58, SY), -90, hang(p(58, SY), -90), [60, A], { footFar: [46, 94] }),
    side(p(58, 54), -90, hang(p(58, 54), -90), [60, 99], {
      footFar: [46, 86],
      tilt: 40,
      tiltFar: 40,
    }),
  ),

  // ---------------------------------------------------------------- leg isolation
  leg_extension: fig(
    side(SEAT_HIP, -100, [42, 78], [60, 96]),
    side(SEAT_HIP, -100, [42, 78], [84, 70], { tilt: -80 }),
    ...seat(30, 56, 81),
    pad([28, 78], [24, 46]),
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: 3, dy: -2 },
      to: { joint: 'ankleNear', dx: 3, dy: -2 },
    },
  ),
  seated_leg_curl: fig(
    side(SEAT_HIP, -100, [42, 78], [84, 70], { tilt: -80 }),
    side(SEAT_HIP, -100, [42, 78], [58, 98]),
    ...seat(30, 56, 81),
    pad([28, 78], [24, 46]),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -6, dy: -6 },
      to: { joint: 'kneeNear', dx: 2, dy: -6 },
    },
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: -1, dy: 4 },
      to: { joint: 'ankleNear', dx: -1, dy: 4 },
    },
  ),
  lying_leg_curl: fig(
    side(p(60, 78), 180, [22, 88], [104, 79, 1], { tilt: 90 }),
    side(p(60, 78), 180, [22, 88], [78, 56, 1], { tilt: 0 }),
    ...bench(16, 88, 84),
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: 1, dy: -5 },
      to: { joint: 'ankleNear', dx: 1, dy: -5 },
    },
  ),
  standing_leg_curl: fig(
    side(p(56, SY), -84, [80, 48], [58, 106], { footFar: [58, A] }),
    side(p(56, SY), -84, [80, 48], [36, 84], { footFar: [58, A], tilt: 30 }),
    frame([84, 40], [84, 112]),
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: 0, dy: -5 },
      to: { joint: 'ankleNear', dx: 0, dy: -5 },
    },
  ),
  hip_abduction_machine: fig(
    front(p(60, 76), [76, 74], [68, 104]),
    front(p(60, 76), [76, 74], [86, 102]),
    pad([42, 80], [78, 80]),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: 5, dy: -4 },
      to: { joint: 'kneeNear', dx: 5, dy: 4 },
    },
    {
      kind: 'pad',
      from: { joint: 'kneeFar', dx: -5, dy: -4 },
      to: { joint: 'kneeFar', dx: -5, dy: 4 },
    },
  ),
  hip_adduction_machine: fig(
    front(p(60, 76), [76, 74], [86, 102]),
    front(p(60, 76), [76, 74], [68, 104]),
    pad([42, 80], [78, 80]),
    {
      kind: 'pad',
      from: { joint: 'kneeNear', dx: -5, dy: -4 },
      to: { joint: 'kneeNear', dx: -5, dy: 4 },
    },
    {
      kind: 'pad',
      from: { joint: 'kneeFar', dx: 5, dy: -4 },
      to: { joint: 'kneeFar', dx: 5, dy: 4 },
    },
  ),
  glute_kickback_machine: fig(
    side(p(50, 68), -40, [80, 60], [58, 96], { footFar: [56, A] }),
    side(p(50, 68), -40, [80, 60], [12, 66], { footFar: [56, A], tilt: 60, tiltFar: 0 }),
    pad([70, 46], [80, 56]),
    frame([86, 56], [86, 112]),
  ),
  cable_glute_kickback: fig(
    side(p(52, SY), -76, [78, 44], [56, 104], { footFar: [56, A] }),
    side(p(52, SY), -76, [78, 44], [24, 88], { footFar: [56, A], tilt: 40 }),
    frame([82, 36], [82, 112]),
    cable([104, 104], 'ankleNear'),
  ),
  cable_hip_abduction: fig(
    front(p(58, SY), [74, 58], [66, A], { handFar: [36, 50, 1], footFar: [52, A, 1] }),
    front(p(58, SY), [74, 58], [86, 98], { handFar: [36, 50, 1], footFar: [52, A, 1] }),
    frame([30, 40], [30, 112]),
    cable([30, 104], 'ankleNear'),
  ),
  cable_hip_adduction: fig(
    front(p(58, SY), [74, 58], [84, 100], { handFar: [36, 50, 1], footFar: [52, A, 1] }),
    front(p(58, SY), [74, 58], [56, 104], { handFar: [36, 50, 1], footFar: [52, A, 1] }),
    frame([30, 40], [30, 112]),
    cable([104, 104], 'ankleNear'),
  ),
  nordic_curl: fig(
    side(p(50, 84), -90, onShoulder(p(50, 84), -90, 10, 10), [27, 104], { toes: -1 }),
    side(p(66, 91), -40, [96, 100], [27, 104], { toes: -1 }),
    {
      kind: 'pad',
      from: { joint: 'ankleNear', dx: -2, dy: -6 },
      to: { joint: 'ankleNear', dx: 4, dy: -6 },
    },
  ),
  band_lateral_walk: fig(front(p(60, 70), [70, 54], [68, A]), front(p(60, 70), [70, 54], [80, A]), {
    kind: 'band',
    from: 'kneeFar',
    to: 'kneeNear',
  }),

  // ---------------------------------------------------------------- plyometrics
  pogo_hops: fig(
    side(p(58, SY), -90, hang(p(58, SY), -90), [60, A]),
    side(p(58, 54), -90, hang(p(58, 54), -90), [60, 99], { tilt: 40 }),
  ),
  box_jump: fig(
    side(p(30, 80), -55, [18, 70, -1], [40, A]),
    side(p(70, 54), -68, [98, 38], [80, 78]),
    box(60, 80, 40),
  ),
  broad_jump: fig(
    side(p(26, 80), -50, [12, 74, -1], [36, A]),
    side(p(80, 82), -60, [108, 66], [94, A]),
  ),
  bounding: fig(
    side(p(54, 62), -80, [74, 50], [30, 96], { footFar: [72, 84], handFar: [38, 62] }),
    side(p(62, 62), -80, [42, 62], [80, 84], { footFar: [38, 96], handFar: [82, 50] }),
  ),
  a_skips: fig(
    side(p(58, SY), -90, [70, 46], [60, A], { footFar: [66, 88], handFar: [48, 58] }),
    side(p(58, SY), -90, [48, 58], [66, 88], { footFar: [60, A], handFar: [70, 46] }),
  ),
  jump_squat: fig(
    side(SQ_LOW, -60, onShoulder(SQ_LOW, -60, 24, 6), [60, A]),
    side(p(58, 52), -90, hang(p(58, 52), -90), [60, 98], { tilt: 40 }),
  ),
  lateral_bounds: fig(
    front(p(46, 74), [52, 58], [44, A], { footFar: [58, 96, 1], torso: -96 }),
    front(p(74, 74), [80, 58], [80, A], { footFar: [66, 96, 1], torso: -84 }),
  ),

  // carries walk with weight in the hands
  farmer_carry: fig(
    side(p(56, SY), -90, hang(p(56, SY), -90), [70, A], { footFar: [44, 106], tiltFar: 30 }),
    side(p(62, SY), -90, hang(p(62, SY), -90), [52, 106], { footFar: [76, A], tilt: 30 }),
    db,
    dbFar,
  ),
  suitcase_carry: fig(
    front(p(58, SY), [72, 60], [66, A]),
    front(p(58, SY), [72, 60], [66, A], { handFar: [42, 60, 1] }),
    db,
  ),
};
