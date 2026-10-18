'use client';

import {
  analyzeRaceResult,
  formatDuration,
  REFERENCE_RACE_IDS,
  type ReferenceRaceId,
} from '@peakr/engine';
import { useState } from 'react';

import { interpolate, messages } from '@/i18n';

import { DurationField, SegmentedControl } from '../components/fields';
import { Card, EstimateBadge, ResultHeader, Results, SectionHeading } from '../components/result';
import { ZoneTable } from '../components/zone-table';
import { fieldError, useDurationField } from '../form';
import { paceRows, paceValue } from '../format';

const t = messages.tools.pace;
const units = messages.units;
const perKm = units.perKm;

export function PaceCalculator() {
  const [distance, setDistance] = useState<ReferenceRaceId>('10k');
  const time = useDurationField({ showHours: true });

  const result = analyzeRaceResult({ distance, timeSec: time.value });
  const issues = result.ok ? [] : result.issues;
  const pace = (sec: number) => paceValue(sec, perKm);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <p className="text-muted">{t.intro}</p>
        <SegmentedControl
          label={t.distanceLabel}
          options={REFERENCE_RACE_IDS.map((id) => ({ value: id, label: messages.races[id] }))}
          value={distance}
          onChange={setDistance}
        />
      </div>

      <DurationField
        label={interpolate(t.timeLabel, { distance: messages.races[distance] })}
        value={time.parts}
        onChange={time.setParts}
        onBlur={time.onBlur}
        showHours
        unitLabels={{ h: units.h, m: units.min, s: units.s }}
        partNames={{ h: units.hours, m: units.minutes, s: units.seconds }}
        error={fieldError(time, 'timeSec', issues, formatDuration)}
      />

      <Results>
        {result.ok ? (
          <>
            <Card>
              <ResultHeader label={t.racePace} value={pace(result.value.paceSecPerKm)} />
              <ResultHeader
                label={t.thresholdPace}
                value={pace(result.value.thresholdPaceSecPerKm)}
                isEstimate
                note={t.thresholdNote}
              />
            </Card>

            <div className="flex items-center gap-2">
              <SectionHeading>{t.predictionsTitle}</SectionHeading>
              <EstimateBadge />
            </div>
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">{t.predictionsTitle}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t.predictionsDistance}</th>
                    <th scope="col">{t.predictionsTime}</th>
                    <th scope="col">{t.predictionsPace}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.value.predictions.map((p) => (
                    <tr
                      key={p.distance}
                      aria-current={p.isInput ? 'true' : undefined}
                      className={`border-t border-border first:border-t-0 ${
                        p.isInput ? 'bg-surface-2' : ''
                      }`}
                    >
                      <th scope="row" className="px-4 py-3 font-normal">
                        {messages.races[p.distance]}
                      </th>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {formatDuration(p.timeSec)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted tabular-nums">
                        {pace(p.paceSecPerKm)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted">{t.predictionsNote}</p>

            <SectionHeading>{t.zonesTitle}</SectionHeading>
            <ZoneTable caption={t.zonesTitle} rows={paceRows(result.value.paceZones, perKm)} />
          </>
        ) : null}
      </Results>
    </div>
  );
}
