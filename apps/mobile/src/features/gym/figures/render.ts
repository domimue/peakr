import { GROUND, solvePose, type Joints, type Point, type PoseSpec } from './skeleton';

/** Where a piece of equipment sits: a fixed point, a joint, or a joint plus an offset. */
export type Anchor = Point | keyof Joints | { joint: keyof Joints; dx?: number; dy?: number };

export type Prop =
  /** Barbell seen from the side: the plate. */
  | { kind: 'barbell'; at: Anchor }
  | { kind: 'dumbbell'; at: Anchor }
  | { kind: 'kettlebell'; at: Anchor }
  /** A surface you sit or lie on, or press against (bench, seat, backrest, roller pad). */
  | { kind: 'pad'; from: Anchor; to: Anchor }
  /** Thin machine frame or rack lines. */
  | { kind: 'frame'; points: Anchor[] }
  /** Cable from a pulley to a handle. */
  | { kind: 'cable'; from: Point; to: Anchor }
  /** A handle or bar held in the hands (pull-up bar, cable handle, machine grip). */
  | { kind: 'grip'; at: Anchor }
  /** Front view: a barbell between the hands with plates at both ends. */
  | { kind: 'barFront' }
  /** A band or rope between two points. */
  | { kind: 'band'; from: Anchor; to: Anchor };

export interface FigureDef {
  /** Start of the movement – drawn faint. */
  start: PoseSpec;
  /** Working position – drawn solid. */
  end: PoseSpec;
  props: Prop[];
}

export interface FigureColors {
  body: string;
  equipment: string;
}

const STROKE = 5;
const f = (n: number) => Math.round(n * 10) / 10;

function resolve(anchor: Anchor, j: Joints): Point {
  if (typeof anchor === 'string') return j[anchor];
  if (Array.isArray(anchor)) return anchor as Point;
  const a = anchor as { joint: keyof Joints; dx?: number; dy?: number };
  const p = j[a.joint];
  return [p[0] + (a.dx ?? 0), p[1] + (a.dy ?? 0)];
}

const line = (a: Point, b: Point, extra = '') =>
  `<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}"${extra}/>`;
const poly = (pts: readonly Point[], extra = '') =>
  `<polyline points="${pts.map((p) => `${f(p[0])},${f(p[1])}`).join(' ')}" fill="none"${extra}/>`;

/** Props that follow the body (they move between start and end). */
function moves(prop: Prop): boolean {
  if (prop.kind === 'barFront') return true;
  const anchors =
    prop.kind === 'pad' || prop.kind === 'band'
      ? [prop.from, prop.to]
      : prop.kind === 'frame'
        ? prop.points
        : prop.kind === 'cable'
          ? [prop.to]
          : [prop.at];
  return anchors.some((a) => !Array.isArray(a));
}

function propSvg(prop: Prop, j: Joints, c: FigureColors): string {
  const eq = `stroke="${c.equipment}" stroke-linecap="round" stroke-linejoin="round"`;
  switch (prop.kind) {
    case 'barbell': {
      const [x, y] = resolve(prop.at, j);
      return `<circle cx="${f(x)}" cy="${f(y)}" r="7.5" fill="none" ${eq} stroke-width="3.5"/><circle cx="${f(x)}" cy="${f(y)}" r="2" fill="${c.equipment}"/>`;
    }
    case 'dumbbell': {
      const [x, y] = resolve(prop.at, j);
      return `<circle cx="${f(x)}" cy="${f(y)}" r="4.5" fill="none" ${eq} stroke-width="3"/>`;
    }
    case 'kettlebell': {
      const [x, y] = resolve(prop.at, j);
      return `<circle cx="${f(x)}" cy="${f(y + 6)}" r="5.5" fill="${c.equipment}"/>${line([x - 3, y + 1], [x + 3, y + 1], ` ${eq} stroke-width="2.5"`)}`;
    }
    case 'pad':
      return line(resolve(prop.from, j), resolve(prop.to, j), ` ${eq} stroke-width="6"`);
    case 'frame':
      return poly(
        prop.points.map((p) => resolve(p, j)),
        ` ${eq} stroke-width="2.5"`,
      );
    case 'cable': {
      const to = resolve(prop.to, j);
      return `${line(prop.from, to, ` ${eq} stroke-width="1.5"`)}<circle cx="${f(prop.from[0])}" cy="${f(prop.from[1])}" r="3" fill="${c.equipment}"/>`;
    }
    case 'barFront': {
      const y = (j.handNear[1] + j.handFar[1]) / 2;
      const a: Point = [Math.min(j.handNear[0], j.handFar[0]) - 14, y];
      const b: Point = [Math.max(j.handNear[0], j.handFar[0]) + 14, y];
      return `${line(a, b, ` ${eq} stroke-width="2.5"`)}${line([a[0], y - 7], [a[0], y + 7], ` ${eq} stroke-width="5"`)}${line([b[0], y - 7], [b[0], y + 7], ` ${eq} stroke-width="5"`)}`;
    }
    case 'band':
      return line(
        resolve(prop.from, j),
        resolve(prop.to, j),
        ` ${eq} stroke-width="2" stroke-dasharray="3 3"`,
      );
    case 'grip': {
      const [x, y] = resolve(prop.at, j);
      return `<circle cx="${f(x)}" cy="${f(y)}" r="2.5" fill="${c.equipment}"/>`;
    }
  }
}

function bodySvg(j: Joints, c: FigureColors, front: boolean): string {
  const st = `stroke="${c.body}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  const far = [
    poly([j.shoulderFar, j.elbowFar, j.handFar], ` ${st}`),
    poly([j.hipFar, j.kneeFar, j.ankleFar, j.toeFar], ` ${st}`),
  ].join('');
  const near = [
    poly([j.hipNear, j.kneeNear, j.ankleNear, j.toeNear], ` ${st}`),
    line(j.hip, j.shoulder, ` ${st}`),
    poly([j.shoulderNear, j.elbowNear, j.handNear], ` ${st}`),
  ].join('');
  // Seen from the front both sides are equally near; shoulders and hips get a cross line.
  const frame = front
    ? line(j.shoulderFar, j.shoulderNear, ` ${st}`) + line(j.hipFar, j.hipNear, ` ${st}`)
    : '';
  return `${front ? far : `<g opacity="0.4">${far}</g>`}${frame}${near}<circle cx="${f(j.head[0])}" cy="${f(j.head[1])}" r="6" fill="${c.body}"/>`;
}

/**
 * The figure as an SVG document: floor, fixed equipment, the start pose faint, the working pose
 * solid. Colours come from the theme (no hex values here).
 */
export function figureSvg(def: FigureDef, c: FigureColors): string {
  const start = solvePose(def.start);
  const end = solvePose(def.end);
  const fixed = def.props.filter((p) => !moves(p));
  const moving = def.props.filter(moves);
  const parts = [
    line(
      [8, GROUND + 2],
      [112, GROUND + 2],
      ` stroke="${c.equipment}" stroke-width="2" stroke-linecap="round" opacity="0.6"`,
    ),
    ...fixed.map((p) => propSvg(p, end, c)),
    `<g opacity="0.22">${moving.map((p) => propSvg(p, start, c)).join('')}${bodySvg(start, c, def.start.view === 'front')}</g>`,
    bodySvg(end, c, def.end.view === 'front'),
    ...moving.map((p) => propSvg(p, end, c)),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${parts.join('')}</svg>`;
}
