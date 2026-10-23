import type { ZoneNumber } from '../zones';
import { planConfig } from './config';
import { indoorVersion, type IndoorVersion } from './indoor';
import type { Block, PlanNote, Step, Workout } from './types';

/**
 * Zwift workout file (.zwo) for an indoor bike or run session (CLAUDE.md "Zwift"). Bike steps are
 * prescribed in % FTP, taken from the plan's power range; steps with heart rate only fall back to
 * the zone's typical % FTP and the file says so. Run steps use Zwift's pace levels. The user saves
 * the file into Zwift's workouts folder (see the how-to in the app).
 */

const cfg = planConfig.zwift;

export type ZwiftSport = 'bike' | 'run';

export interface ZwoOptions {
  /** Workout name shown in Zwift (translated by the caller). */
  name: string;
  /** Short description shown in Zwift; the HR-fallback note is appended. */
  description?: string;
  /** Overrides the indoor version (default: `indoorVersion(workout)`). */
  indoor?: IndoorVersion | null;
}

export interface ZwoFile {
  sport: ZwiftSport;
  xml: string;
  fileName: string;
  sizeBytes: number;
  /** i18n notes for the UI, e.g. `zwiftNotes.hrFallback`. */
  notes: PlanNote[];
}

export type ZwoResult =
  { ok: true; file: ZwoFile } | { ok: false; reason: 'unsupportedSport' | 'empty' | 'tooLarge' };

const FTP_RANGE = /(\d+)\s*[–-]\s*(\d+)\s*%\s*FTP/;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const fixed = (n: number) => String(Math.round(n * 1000) / 1000);

interface Context {
  sport: ZwiftSport;
  /** At least one bike step had no power range and was converted from its HR zone. */
  hrFallback: boolean;
}

/** Share of FTP (bike) or Zwift pace level (run) of a step. */
function levelOf(step: Step, ctx: Context): number {
  if (ctx.sport === 'run') return cfg.runPaceLevel[step.zone as ZoneNumber];
  const power = [step.target, step.hint].find((t) => t?.kind === 'powerZone');
  const m = power ? FTP_RANGE.exec(power.value) : null;
  if (m) return (Number(m[1]) + Number(m[2])) / 200;
  ctx.hrFallback = true;
  return cfg.zoneFtpFraction[step.zone as ZoneNumber];
}

const attr = (ctx: Context) => (ctx.sport === 'bike' ? 'Power' : 'Pace');

function steady(step: Step, ctx: Context): string | null {
  if (!step.durationSec) return null;
  return `<SteadyState Duration="${step.durationSec}" ${attr(ctx)}="${fixed(levelOf(step, ctx))}"/>`;
}

function ramp(tag: 'Warmup' | 'Cooldown', step: Step, ctx: Context): string | null {
  if (!step.durationSec) return null;
  const level = levelOf(step, ctx);
  const edge = ctx.sport === 'bike' ? Math.min(cfg.rampFtpFraction, level) : level;
  const [low, high] = tag === 'Warmup' ? [edge, level] : [level, edge];
  const a = attr(ctx);
  return `<${tag} Duration="${step.durationSec}" ${a}Low="${fixed(low)}" ${a}High="${fixed(high)}"/>`;
}

/** Work + recovery pair repeated: Zwift's compact interval element. */
function intervals(block: Block, ctx: Context): string | null {
  const [on, off] = block.steps;
  if (block.steps.length !== 2 || !on?.durationSec || !off?.durationSec || !off.rest) return null;
  const a = attr(ctx);
  return (
    `<IntervalsT Repeat="${block.repeat}" OnDuration="${on.durationSec}" ` +
    `OffDuration="${off.durationSec}" On${a}="${fixed(levelOf(on, ctx))}" ` +
    `Off${a}="${fixed(levelOf(off, ctx))}"/>`
  );
}

function blockXml(block: Block, ctx: Context): string[] {
  if (block.repeat > 1) {
    const compact = intervals(block, ctx);
    if (compact) return [compact];
  }
  const once = block.steps.map((s) => steady(s, ctx)).filter((x): x is string => x !== null);
  return Array.from({ length: block.repeat }, () => once).flat();
}

function fileSlug(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return slug || 'workout';
}

export function zwiftSportOf(w: Pick<Workout, 'sport'>): ZwiftSport | null {
  return w.sport === 'bike' ? 'bike' : w.sport === 'run' ? 'run' : null;
}

/**
 * Builds the .zwo for a bike or run session, using the session's indoor version (trainer ride
 * capped in length, treadmill run). Other sports cannot be sent to Zwift.
 */
export function buildZwo(workout: Workout, options: ZwoOptions): ZwoResult {
  const sport = zwiftSportOf(workout);
  if (!sport) return { ok: false, reason: 'unsupportedSport' };
  const indoor = options.indoor === undefined ? indoorVersion(workout) : options.indoor;
  const parts = indoor ?? workout;
  const ctx: Context = { sport, hrFallback: false };

  const body: string[] = [];
  parts.warmup.forEach((s, i) => {
    const x = i === 0 ? ramp('Warmup', s, ctx) : steady(s, ctx);
    if (x) body.push(x);
  });
  for (const block of parts.main) body.push(...blockXml(block, ctx));
  const last = parts.cooldown.length - 1;
  parts.cooldown.forEach((s, i) => {
    const x = i === last ? ramp('Cooldown', s, ctx) : steady(s, ctx);
    if (x) body.push(x);
  });
  if (body.length === 0) return { ok: false, reason: 'empty' };

  const notes: PlanNote[] = [];
  if (ctx.hrFallback) notes.push({ key: 'zwiftNotes.hrFallback' });
  if (sport === 'run') notes.push({ key: 'zwiftNotes.runPace' });
  const description = [
    options.description,
    ctx.hrFallback ? 'Power converted from HR zones.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<workout_file>',
    '  <author>Peakr</author>',
    `  <name>${xmlEscape(options.name)}</name>`,
    `  <description>${xmlEscape(description)}</description>`,
    `  <sportType>${sport}</sportType>`,
    '  <tags><tag name="Peakr"/></tags>',
    '  <workout>',
    ...body.map((l) => `    ${l}`),
    '  </workout>',
    '</workout_file>',
    '',
  ].join('\n');

  const sizeBytes = new TextEncoder().encode(xml).length;
  if (sizeBytes >= cfg.maxFileBytes) return { ok: false, reason: 'tooLarge' };
  return {
    ok: true,
    file: { sport, xml, fileName: `peakr-${fileSlug(options.name)}.zwo`, sizeBytes, notes },
  };
}
