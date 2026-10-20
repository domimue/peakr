import type { FigureDef, Prop } from './render';
import { polar, type Bend, type LimbTarget, type Point, type PoseSpec } from './skeleton';

/** Short-hands for writing poses: targets as `[x, y]` or `[x, y, bend]`. */
export type Tgt = readonly [number, number] | readonly [number, number, Bend];

export interface More {
  handFar?: Tgt;
  footFar?: Tgt;
  neck?: number;
  toes?: 1 | -1;
  tilt?: number;
  tiltFar?: number;
}

const target = (v: Tgt, bend: Bend): LimbTarget => ({
  at: [v[0], v[1]],
  bend: v.length === 3 ? v[2] : bend,
});

function extras(more: More, hand: Bend, foot: Bend): Partial<PoseSpec> {
  return {
    ...(more.handFar ? { handFar: target(more.handFar, hand) } : {}),
    ...(more.footFar ? { footFar: target(more.footFar, foot) } : {}),
    ...(more.neck !== undefined ? { neck: more.neck } : {}),
    ...(more.toes ? { toes: more.toes } : {}),
    ...(more.tilt !== undefined ? { footTilt: more.tilt } : {}),
    ...(more.tiltFar !== undefined ? { footTiltFar: more.tiltFar } : {}),
  };
}

/** Side view, facing right. Elbows bend back (+1), knees forward (-1) unless given. */
export function side(hip: Point, torso: number, hand: Tgt, foot: Tgt, more: More = {}): PoseSpec {
  return {
    hip,
    torso,
    handNear: target(hand, 1),
    footNear: target(foot, -1),
    ...extras(more, 1, -1),
  };
}

/** Front view; `hand` / `foot` are the figure's left side (viewer's right), mirrored if not given. */
export function front(
  hip: Point,
  hand: Tgt,
  foot: Tgt,
  more: More & { torso?: number } = {},
): PoseSpec {
  return {
    view: 'front',
    hip,
    torso: more.torso ?? -90,
    handNear: target(hand, -1),
    footNear: target(foot, -1),
    ...extras(more, 1, 1),
  };
}

/** Shoulder (torso top) of a hip and torso angle. */
export const sh = (hip: Point, torso: number): Point => polar(hip, torso, 30);

export const fig = (start: PoseSpec, end: PoseSpec, ...props: Prop[]): FigureDef => ({
  start,
  end,
  props,
});

/** Holds still: start and end are the same pose. */
export const hold = (pose: PoseSpec, ...props: Prop[]): FigureDef => fig(pose, pose, ...props);

// Common equipment.
export const bar: Prop = { kind: 'barbell', at: 'handNear' };
export const db: Prop = { kind: 'dumbbell', at: 'handNear' };
export const dbFar: Prop = { kind: 'dumbbell', at: 'handFar' };
export const kb: Prop = { kind: 'kettlebell', at: 'handNear' };
export const grip: Prop = { kind: 'grip', at: 'handNear' };
export const cable = (
  from: Point,
  to: 'handNear' | 'handFar' | 'ankleNear' = 'handNear',
): Prop => ({
  kind: 'cable',
  from,
  to,
});
export const pad = (from: Point, to: Point): Prop => ({ kind: 'pad', from, to });
export const frame = (...points: Point[]): Prop => ({ kind: 'frame', points });
/** Seat at height y from x0 to x1, with a post to the floor. */
export const seat = (x0: number, x1: number, y = 80): Prop[] => [
  pad([x0, y], [x1, y]),
  frame([(x0 + x1) / 2, y + 3], [(x0 + x1) / 2, 112]),
];
/** Flat bench top at y from x0 to x1. */
export const bench = (x0: number, x1: number, y = 81): Prop[] => [
  pad([x0, y], [x1, y]),
  frame([x0 + 8, y + 3], [x0 + 8, 112]),
  frame([x1 - 8, y + 3], [x1 - 8, 112]),
];
/** A machine column (weight stack) at x. */
export const column = (x: number, top = 20): Prop => frame([x, 112], [x, top]);
/** A box or step: top-left corner and width. */
export const box = (x: number, top: number, w: number): Prop =>
  frame([x, 112], [x, top], [x + w, top], [x + w, 112]);

/** Standing tall at x: hip, torso and hands hanging. */
export const STAND_Y = 63;
export const ANKLE_Y = 108;
