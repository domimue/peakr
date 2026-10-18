import { calculateHrZones } from '@peakr/engine';
import { useTranslation } from 'react-i18next';

import { Card, Reveal, Screen, Text, TextField, ZoneTable } from '@/ui';

import { useFieldError, useIntegerField } from '../form';
import { useZoneFormat } from '../format';
import { ResultHeader } from '../result-header';

const BENEFITS = ['base', 'fat', 'recovery', 'volume'] as const;

export function Zone2Screen() {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const { bpmRange, hrRows } = useZoneFormat();

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
    <Screen>
      <Card>
        <Text variant="heading">{t('tools.zone2.whyTitle')}</Text>
        {BENEFITS.map((key) => (
          <Text key={key}>
            {'•  '}
            {t(`tools.zone2.benefits.${key}`)}
          </Text>
        ))}
      </Card>

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
      <TextField
        label={t('fields.restingHrOptional')}
        hint={t('tools.zone2.restingHint')}
        value={restingHr.text}
        onChangeText={restingHr.setText}
        onBlur={restingHr.onBlur}
        error={fieldError(restingHr, 'restingHr', issues)}
        keyboardType="number-pad"
        maxLength={3}
        suffix={t('units.bpm')}
      />
      <TextField
        label={t('fields.hrMaxOptional')}
        hint={t('fields.hrMaxHint')}
        value={hrMax.text}
        onChangeText={hrMax.setText}
        onBlur={hrMax.onBlur}
        error={fieldError(hrMax, 'hrMax', issues)}
        keyboardType="number-pad"
        maxLength={3}
        suffix={t('units.bpm')}
      />

      {result.ok && zone2 ? (
        <Reveal>
          <Card>
            <ResultHeader
              label={t('tools.zone2.resultLabel')}
              value={bpmRange(zone2)}
              isEstimate={result.value.hrMaxIsEstimate}
              note={t(`tools.zone2.methodNote.${result.value.method}`, {
                hrMax: result.value.hrMax,
              })}
            />
            <Text tone="secondary">{t('tools.zone2.talkTest')}</Text>
          </Card>
          <ZoneTable rows={hrRows(result.value.zones, 2)} />
        </Reveal>
      ) : null}
    </Screen>
  );
}
