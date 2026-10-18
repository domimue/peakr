import {
  calculateHrZones,
  defaultHrMethod,
  HR_ZONE_METHODS,
  type HrZoneMethod,
} from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Card, Reveal, Screen, SegmentedControl, Text, TextField, ZoneTable } from '@/ui';

import { useFieldError, useIntegerField } from '../form';
import { useZoneFormat } from '../format';
import { ResultHeader } from '../result-header';

export function HrZonesScreen() {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const { hrRows } = useZoneFormat();

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
    <Screen>
      <SegmentedControl
        options={HR_ZONE_METHODS.map((m) => ({ value: m, label: t(`tools.hrZones.methods.${m}`) }))}
        value={method}
        onChange={setPickedMethod}
      />
      <Text tone="secondary">{t(`tools.hrZones.methodInfo.${method}`)}</Text>
      {pickedMethod === null ? (
        <Text variant="caption" tone="secondary">
          {t('tools.hrZones.autoMethod')}
        </Text>
      ) : null}

      {usesLthr ? (
        <TextField
          label={t('fields.lthr')}
          hint={t('fields.lthrHint')}
          value={lthr.text}
          onChangeText={lthr.setText}
          onBlur={lthr.onBlur}
          error={fieldError(lthr, 'lthr', issues)}
          keyboardType="number-pad"
          maxLength={3}
          suffix={t('units.bpm')}
        />
      ) : (
        <TextField
          label={t('fields.age')}
          hint={t('fields.ageHint')}
          value={age.text}
          onChangeText={age.setText}
          onBlur={age.onBlur}
          error={fieldError(age, 'age', issues)}
          keyboardType="number-pad"
          maxLength={3}
          suffix={t('units.years')}
        />
      )}

      {showResting && !usesLthr ? (
        <TextField
          label={method === 'karvonen' ? t('fields.restingHr') : t('fields.restingHrOptional')}
          hint={t('fields.restingHrHint')}
          value={restingHr.text}
          onChangeText={restingHr.setText}
          onBlur={restingHr.onBlur}
          error={fieldError(restingHr, 'restingHr', issues)}
          keyboardType="number-pad"
          maxLength={3}
          suffix={t('units.bpm')}
        />
      ) : null}

      <TextField
        label={t('fields.hrMaxOptional')}
        hint={usesLthr ? t('fields.hrMaxLthrHint') : t('fields.hrMaxHint')}
        value={hrMax.text}
        onChangeText={hrMax.setText}
        onBlur={hrMax.onBlur}
        error={fieldError(hrMax, 'hrMax', issues)}
        keyboardType="number-pad"
        maxLength={3}
        suffix={t('units.bpm')}
      />

      {result.ok ? (
        <Reveal>
          <Card>
            {result.value.hrMax !== null ? (
              <ResultHeader
                label={t('tools.hrZones.hrMaxUsed')}
                value={t('units.bpmValue', { value: result.value.hrMax })}
                isEstimate={result.value.hrMaxIsEstimate}
                note={
                  result.value.hrMaxIsEstimate ? t('tools.hrZones.hrMaxEstimateNote') : undefined
                }
              />
            ) : (
              <ResultHeader
                label={t('tools.hrZones.lthrUsed')}
                value={t('units.bpmValue', { value: result.value.lthr })}
              />
            )}
          </Card>
          <Text variant="heading">{t('tools.hrZones.resultTitle')}</Text>
          <ZoneTable rows={hrRows(result.value.zones)} />
        </Reveal>
      ) : null}
    </Screen>
  );
}
