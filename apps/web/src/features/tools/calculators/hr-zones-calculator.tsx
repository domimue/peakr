'use client';

import {
  calculateHrZones,
  defaultHrMethod,
  HR_ZONE_METHODS,
  type HrZoneMethod,
} from '@peakr/engine';
import { useState } from 'react';

import { messages } from '@/i18n';

import { NumberField, SegmentedControl } from '../components/fields';
import { Card, ResultHeader, Results, SectionHeading } from '../components/result';
import { ZoneTable } from '../components/zone-table';
import { fieldError, useIntegerField } from '../form';
import { bpmValue, hrRows } from '../format';

const t = messages.tools.hrZones;
const fields = messages.fields;
const bpm = messages.units.bpm;

export function HrZonesCalculator() {
  // null = automatic: Karvonen once a resting HR is entered, otherwise %HRmax.
  const [pickedMethod, setPickedMethod] = useState<HrZoneMethod | null>(null);
  const age = useIntegerField();
  const hrMax = useIntegerField();
  const restingHr = useIntegerField();
  const lthr = useIntegerField();

  const method = pickedMethod ?? defaultHrMethod({ restingHr: restingHr.value });
  const usesLthr = method === 'lthr';
  const showResting = method === 'karvonen' || pickedMethod === null;

  const result = calculateHrZones({
    method,
    age: usesLthr ? undefined : age.value,
    hrMax: hrMax.value,
    restingHr: showResting && !usesLthr ? restingHr.value : undefined,
    lthr: usesLthr ? lthr.value : undefined,
  });
  const issues = result.ok ? [] : result.issues;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SegmentedControl
          label={t.methodLabel}
          options={HR_ZONE_METHODS.map((m) => ({ value: m, label: t.methods[m] }))}
          value={method}
          onChange={setPickedMethod}
        />
        <p className="text-muted">{t.methodInfo[method]}</p>
        {pickedMethod === null ? <p className="text-sm text-muted">{t.autoMethod}</p> : null}
      </div>

      <div className="flex flex-col gap-5">
        {usesLthr ? (
          <NumberField
            label={fields.lthr}
            hint={fields.lthrHint}
            value={lthr.text}
            onChange={lthr.setText}
            onBlur={lthr.onBlur}
            error={fieldError(lthr, 'lthr', issues)}
            suffix={bpm}
          />
        ) : (
          <NumberField
            label={fields.age}
            hint={fields.ageHint}
            value={age.text}
            onChange={age.setText}
            onBlur={age.onBlur}
            error={fieldError(age, 'age', issues)}
            suffix={messages.units.years}
          />
        )}

        {showResting && !usesLthr ? (
          <NumberField
            label={method === 'karvonen' ? fields.restingHr : fields.restingHrOptional}
            hint={fields.restingHrHint}
            value={restingHr.text}
            onChange={restingHr.setText}
            onBlur={restingHr.onBlur}
            error={fieldError(restingHr, 'restingHr', issues)}
            suffix={bpm}
          />
        ) : null}

        <NumberField
          label={fields.hrMaxOptional}
          hint={usesLthr ? fields.hrMaxLthrHint : fields.hrMaxHint}
          value={hrMax.text}
          onChange={hrMax.setText}
          onBlur={hrMax.onBlur}
          error={fieldError(hrMax, 'hrMax', issues)}
          suffix={bpm}
        />
      </div>

      <Results>
        {result.ok ? (
          <>
            <Card>
              {result.value.hrMax !== null ? (
                <ResultHeader
                  label={t.hrMaxUsed}
                  value={bpmValue(result.value.hrMax)}
                  isEstimate={result.value.hrMaxIsEstimate}
                  note={result.value.hrMaxIsEstimate ? t.hrMaxEstimateNote : undefined}
                />
              ) : (
                <ResultHeader label={t.lthrUsed} value={bpmValue(result.value.lthr)} />
              )}
            </Card>
            <SectionHeading>{t.resultTitle}</SectionHeading>
            <ZoneTable caption={t.resultTitle} rows={hrRows(result.value.zones)} />
          </>
        ) : null}
      </Results>
    </div>
  );
}
