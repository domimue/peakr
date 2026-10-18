import { formatDuration, type HrZone, type PaceZone, type ZoneNumber } from '@peakr/engine';

import { interpolate, messages } from '@/i18n';

import type { ZoneRow } from './components/zone-table';

const units = messages.units;

export function zoneLabel(zone: ZoneNumber): string {
  return interpolate(messages.zones.label, { zone });
}

export function zoneName(zone: ZoneNumber): string {
  return messages.zones.names[zone];
}

export function bpmValue(value: number | null): string {
  return interpolate(units.bpmValue, { value });
}

export function bpmRange({ minBpm, maxBpm }: Pick<HrZone, 'minBpm' | 'maxBpm'>): string {
  if (minBpm === null) return interpolate(units.bpmUpTo, { value: maxBpm });
  if (maxBpm === null) return interpolate(units.bpmFrom, { value: minBpm });
  return interpolate(units.bpmRange, { min: minBpm, max: maxBpm });
}

export function paceValue(sec: number, unit: string): string {
  return interpolate(units.paceValue, { pace: formatDuration(sec), unit });
}

export function paceRange({ slowestSec, fastestSec }: PaceZone, unit: string): string {
  if (slowestSec === null && fastestSec !== null) {
    return interpolate(units.paceOrSlower, { pace: formatDuration(fastestSec), unit });
  }
  if (fastestSec === null && slowestSec !== null) {
    return interpolate(units.paceOrFaster, { pace: formatDuration(slowestSec), unit });
  }
  return interpolate(units.paceRange, {
    slow: formatDuration(slowestSec ?? 0),
    fast: formatDuration(fastestSec ?? 0),
    unit,
  });
}

export function hrRows(zones: readonly HrZone[], highlight?: ZoneNumber): ZoneRow[] {
  return zones.map((z) => ({
    zone: z.zone,
    label: zoneLabel(z.zone),
    name: zoneName(z.zone),
    range: bpmRange(z),
    highlighted: z.zone === highlight,
  }));
}

export function paceRows(zones: readonly PaceZone[], unit: string): ZoneRow[] {
  return zones.map((z) => ({
    zone: z.zone,
    label: zoneLabel(z.zone),
    name: zoneName(z.zone),
    range: paceRange(z, unit),
  }));
}
