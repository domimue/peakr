'use client';

import { calculateCss, formatDuration } from '@peakr/engine';

import { messages } from '@/i18n';

import { DurationField } from '../components/fields';
import { Card, ResultHeader, Results, SectionHeading } from '../components/result';
import { ZoneTable } from '../components/zone-table';
import { fieldError, useDurationField } from '../form';
import { paceRows, paceValue } from '../format';

const t = messages.tools.swim;
const units = messages.units;
const unitLabels = { h: units.h, m: units.min, s: units.s };
const partNames = { h: units.hours, m: units.minutes, s: units.seconds };

export function SwimCssCalculator() {
  const time400 = useDurationField({ showHours: false });
  const time200 = useDurationField({ showHours: false });

  const result = calculateCss({ time400Sec: time400.value, time200Sec: time200.value });
  const issues = result.ok ? [] : result.issues;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <DurationField
          label={t.time400}
          value={time400.parts}
          onChange={time400.setParts}
          onBlur={time400.onBlur}
          unitLabels={unitLabels}
          partNames={partNames}
          error={fieldError(time400, 'time400Sec', issues, formatDuration)}
        />
        <DurationField
          label={t.time200}
          value={time200.parts}
          onChange={time200.setParts}
          onBlur={time200.onBlur}
          unitLabels={unitLabels}
          partNames={partNames}
          error={fieldError(time200, 'time200Sec', issues, formatDuration)}
        />
      </div>

      <Results>
        {result.ok ? (
          <>
            <Card>
              <ResultHeader
                label={t.cssLabel}
                value={paceValue(result.value.cssPacePer100mSec, units.per100m)}
                note={t.cssNote}
              />
            </Card>
            <SectionHeading>{t.zonesTitle}</SectionHeading>
            <ZoneTable caption={t.zonesTitle} rows={paceRows(result.value.zones, units.per100m)} />
          </>
        ) : null}
      </Results>
    </div>
  );
}
