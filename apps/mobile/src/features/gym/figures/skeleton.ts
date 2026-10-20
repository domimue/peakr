/**
 * The Peakr exercise figure: a stick figure in a 120 × 120 box (same box as the logo), seen from
 * the side (facing right) or from the front. Poses are given by a few targets – hip, torso angle,
 * hands, feet – and elbows and knees are solved with two-bone inverse kinematics, so every segment
 * keeps its length in every pose. Our own geometry; no image or pose data from elsewhere.
 */

export type Point = readonly [number, number];

/** Segment lengths in figure units (120 = box size). */
export const SEGMENTS = {
  torso: 30,
  neck: 9,
  headRadius: 6,
  upperArm: 15,
  forearm: 14,
  thigh: 23,
  shin: 23,
  foot: 7,
  /** Front view: half the shoulder and hip width. */
  shoulderHalf: 9,
  hipHalf: 5,
} as const;

/** Floor line of every figure; ankles of a standing figure are at GROUND - 2. */
export const GROUND = 110;

/** Which way a joint bends: 1 = clockwise from root→target on screen, -1 = counter-clockwise. */
export type Bend = 1 | -1;

export interface LimbTarget {
  /** Hand or ankle position. */
  at: Point;
  /** Elbow or knee side. */
  bend: Bend;
}

export interface PoseSpec {
  /** Side view facing right (default) or front view. */
  view?: 'side' | 'front';
  hip: Point;
  /** Direction hip → shoulder in degrees (0 = right, -90 = up, 90 = down). Front view: -90. */
  torso: number;
  /** Direction shoulder → head; defaults to the torso direction. */
  neck?: number;
  /**
   * Side view: near side (solid) and far side (faint); far defaults to near.
   * Front view: the figure's left side (viewer's right); the other side mirrors it unless given.
   */
  handNear: LimbTarget;
  handFar?: LimbTarget;
  footNear: LimbTarget;
  footFar?: LimbTarget;
  /** Side view: which way the toes point, 1 = right, -1 = left. Default 1. */
  toes?: 1 | -1;
  /** Foot angle in degrees (negative = toes up). */
  footTilt?: number;
  footTiltFar?: number;
}

export interface Joints {
  head: Point;
  /** Centre of the shoulders / hips (the torso line). */
  shoulder: Point;
  hip: Point;
  shoulderNear: Point;
  shoulderFar: Point;
  hipNear: Point;
  hipFar: Point;
  elbowNear: Point;
  handNear: Point;
  elbowFar: Point;
  handFar: Point;
  kneeNear: Point;
  ankleNear: Point;
  toeNear: Point;
  kneeFar: Point;
  ankleFar: Point;
  toeFar: Point;
}

const rad = (deg: number) => (deg * Math.PI) / 180;

export function polar(from: Point, deg: number, length: number): Point {
  return [from[0] + length * Math.cos(rad(deg)), from[1] + length * Math.sin(rad(deg))];
}

/**
 * Middle joint of a two-bone chain from `root` towards `target`. A target out of reach is pulled
 * in along the same line (the limb is then fully stretched), so a pose never breaks a segment.
 */
export function solveTwoBone(
  root: Point,
  target: Point,
  a: number,
  b: number,
  bend: Bend,
): { joint: Point; end: Point } {
  const dx = target[0] - root[0];
  const dy = target[1] - root[1];
  const reach = Math.hypot(dx, dy);
  const d = Math.min(Math.max(reach, Math.abs(a - b) + 0.01), a + b - 0.01);
  const base = Math.atan2(dy, dx);
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const angle = base + bend * Math.acos(Math.max(-1, Math.min(1, cos)));
  const joint: Point = [root[0] + a * Math.cos(angle), root[1] + a * Math.sin(angle)];
  const end: Point = [root[0] + d * Math.cos(base), root[1] + d * Math.sin(base)];
  return { joint, end };
}

const mirror = (t: LimbTarget, cx: number): LimbTarget => ({
  at: [2 * cx - t.at[0], t.at[1]],
  bend: (t.bend * -1) as Bend,
});

export function solvePose(p: PoseSpec): Joints {
  const s = SEGMENTS;
  const front = p.view === 'front';
  const shoulder = polar(p.hip, p.torso, s.torso);
  const head = polar(shoulder, p.neck ?? p.torso, s.neck);
  const cx = p.hip[0];
  const shoulderNear: Point = front ? [shoulder[0] + s.shoulderHalf, shoulder[1]] : shoulder;
  const shoulderFar: Point = front ? [shoulder[0] - s.shoulderHalf, shoulder[1]] : shoulder;
  const hipNear: Point = front ? [p.hip[0] + s.hipHalf, p.hip[1]] : p.hip;
  const hipFar: Point = front ? [p.hip[0] - s.hipHalf, p.hip[1]] : p.hip;
  const handFar = p.handFar ?? (front ? mirror(p.handNear, cx) : p.handNear);
  const footFar = p.footFar ?? (front ? mirror(p.footNear, cx) : p.footNear);

  const armNear = solveTwoBone(shoulderNear, p.handNear.at, s.upperArm, s.forearm, p.handNear.bend);
  const armFar = solveTwoBone(shoulderFar, handFar.at, s.upperArm, s.forearm, handFar.bend);
  const legNear = solveTwoBone(hipNear, p.footNear.at, s.thigh, s.shin, p.footNear.bend);
  const legFar = solveTwoBone(hipFar, footFar.at, s.thigh, s.shin, footFar.bend);

  let toeNear: Point;
  let toeFar: Point;
  if (front) {
    // Seen from the front, feet show as short marks turned slightly out.
    toeNear = [legNear.end[0] + 4, legNear.end[1] + 1];
    toeFar = [legFar.end[0] - 4, legFar.end[1] + 1];
  } else {
    const dir = p.toes ?? 1;
    const base = dir === 1 ? 0 : 180;
    toeNear = polar(legNear.end, base + (p.footTilt ?? 0) * dir, s.foot);
    toeFar = polar(legFar.end, base + (p.footTiltFar ?? p.footTilt ?? 0) * dir, s.foot);
  }
  return {
    head,
    shoulder,
    hip: p.hip,
    shoulderNear,
    shoulderFar,
    hipNear,
    hipFar,
    elbowNear: armNear.joint,
    handNear: armNear.end,
    elbowFar: armFar.joint,
    handFar: armFar.end,
    kneeNear: legNear.joint,
    ankleNear: legNear.end,
    toeNear,
    kneeFar: legFar.joint,
    ankleFar: legFar.end,
    toeFar,
  };
}

/** How far each hand and foot target is from what the limb can reach (0 = reachable). */
export function reachErrors(p: PoseSpec): number[] {
  const s = SEGMENTS;
  const j = solvePose(p);
  const front = p.view === 'front';
  const handFar = p.handFar ?? (front ? mirror(p.handNear, p.hip[0]) : p.handNear);
  const footFar = p.footFar ?? (front ? mirror(p.footNear, p.hip[0]) : p.footNear);
  const over = (root: Point, t: Point, max: number) =>
    Math.max(0, Math.hypot(t[0] - root[0], t[1] - root[1]) - max);
  return [
    over(j.shoulderNear, p.handNear.at, s.upperArm + s.forearm),
    over(j.shoulderFar, handFar.at, s.upperArm + s.forearm),
    over(j.hipNear, p.footNear.at, s.thigh + s.shin),
    over(j.hipFar, footFar.at, s.thigh + s.shin),
  ];
}
