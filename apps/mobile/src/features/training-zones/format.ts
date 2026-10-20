import { formatDuration, type HrZone, type PaceZone, type ZoneNumber } from '@peakr/engine';
import { useTranslation } from 'react-i18next';

import type { ZoneRow } from '@/ui';

/** Zones may carry a flag that the user replaced the calculated range manually. */
interface Customisable {
  custom?: boolean;
}

export function useZoneFormat() {
  const { t } = useTranslation();

  const zoneLabel = (zone: ZoneNumber) => t('zones.label', { zone });
  const zoneName = (zone: ZoneNumber) => t(`zones.names.${zone}`);

  function bpmRange({ minBpm, maxBpm }: Pick<HrZone, 'minBpm' | 'maxBpm'>): string {
    if (minBpm === null) return t('units.bpmUpTo', { value: maxBpm });
    if (maxBpm === null) return t('units.bpmFrom', { value: minBpm });
    return t('units.bpmRange', { min: minBpm, max: maxBpm });
  }

  function paceRange({ slowestSec, fastestSec }: PaceZone, unit: string): string {
    if (slowestSec === null && fastestSec !== null) {
      return t('units.paceOrSlower', { pace: formatDuration(fastestSec), unit });
    }
    if (fastestSec === null && slowestSec !== null) {
      return t('units.paceOrFaster', { pace: formatDuration(slowestSec), unit });
    }
    return t('units.paceRange', {
      slow: formatDuration(slowestSec ?? 0),
      fast: formatDuration(fastestSec ?? 0),
      unit,
    });
  }

  function hrRows(zones: readonly (HrZone & Customisable)[], highlight?: ZoneNumber): ZoneRow[] {
    return zones.map((z) => ({
      zone: z.zone,
      label: zoneLabel(z.zone),
      name: zoneName(z.zone),
      range: bpmRange(z),
      highlighted: z.zone === highlight,
      custom: z.custom,
    }));
  }

  function paceRows(zones: readonly (PaceZone & Customisable)[], unit: string): ZoneRow[] {
    return zones.map((z) => ({
      zone: z.zone,
      label: zoneLabel(z.zone),
      name: zoneName(z.zone),
      range: paceRange(z, unit),
      custom: z.custom,
    }));
  }

  return { bpmRange, paceRange, hrRows, paceRows, zoneLabel, zoneName };
}
