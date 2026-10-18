'use client';

import { calculateHrZones } from '@peakr/engine';

import { interpolate, messages } from '@/i18n';

import { NumberField } from '../components/fields';
import { Card, ResultHeader, Results, SectionHeading } from '../components/result';
import { ZoneTable } from '../components/zone-table';
import { fieldError, useIntegerField } from '../form';
import { bpmRange, hrRows } from '../format';

const t = messages.tools.zone2;
const fields = messages.fields;
const bpm = messages.units.bpm;

export function Zone2Calculator() {
  const age = useIntegerField();
  const restingHr = useIntegerField();
  const hrMax = useIntegerField();

  // Method follows the default rule: Karvonen with resting HR, otherwise %HRmax.
  const result = calculateHrZones({
    age: age.value,
    restingHr: restingHr.value,
    hrMax: hrMax.value,
  });
  const issues = result.ok ? [] : result.issues;
  const zone2 = result.ok ? result.value.zones[1] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-5">
        <NumberField
          label={fields.age}
          hint={fields.ageHint}
          value={age.text}
          onChange={age.setText}
          onBlur={age.onBlur}
          error={fieldError(age, 'age', issues)}
          suffix={messages.units.years}
        />
        <NumberField
          label={fields.restingHrOptional}
          hint={t.restingHint}
          value={restingHr.text}
          onChange={restingHr.setText}
          onBlur={restingHr.onBlur}
          error={fieldError(restingHr, 'restingHr', issues)}
          suffix={bpm}
        />
        <NumberField
          label={fields.hrMaxOptional}
          hint={fields.hrMaxHint}
          value={hrMax.text}
          onChange={hrMax.setText}
          onBlur={hrMax.onBlur}
          error={fieldError(hrMax, 'hrMax', issues)}
          suffix={bpm}
        />
      </div>

      <Results>
        {result.ok && zone2 ? (
          <>
            <Card>
              <ResultHeader
                label={t.resultLabel}
                value={bpmRange(zone2)}
                isEstimate={result.value.hrMaxIsEstimate}
                note={interpolate(t.methodNote[result.value.method], {
                  hrMax: result.value.hrMax,
                })}
              />
              <p className="text-muted">{t.talkTest}</p>
            </Card>
            <SectionHeading>{t.zonesTitle}</SectionHeading>
            <ZoneTable caption={t.zonesTitle} rows={hrRows(result.value.zones, 2)} />
          </>
        ) : null}
      </Results>
    </div>
  );
}
