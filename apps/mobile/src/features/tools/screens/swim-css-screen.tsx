import { calculateCss, formatDuration } from '@peakr/engine';
import { useTranslation } from 'react-i18next';

import { Card, DurationField, Reveal, Screen, Text, ZoneTable } from '@/ui';

import { useDurationField, useFieldError } from '../form';
import { useZoneFormat } from '../format';
import { ResultHeader } from '../result-header';

const GUIDE_STEPS = ['warmUp', 'swim400', 'recover', 'swim200', 'record'] as const;

export function SwimCssScreen() {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const { paceRows } = useZoneFormat();

  const time400 = useDurationField({ showHours: false });
  const time200 = useDurationField({ showHours: false });

  const result = calculateCss({ time400Sec: time400.value, time200Sec: time200.value });
  const issues = result.ok ? [] : result.issues;
  const per100 = t('units.per100m');
  const unitLabels = { h: t('units.h'), m: t('units.min'), s: t('units.s') };
  const accessibilityLabels = {
    h: t('units.hours'),
    m: t('units.minutes'),
    s: t('units.seconds'),
  };

  return (
    <Screen>
      <Card>
        <Text variant="heading">{t('tools.swim.guideTitle')}</Text>
        {GUIDE_STEPS.map((step, index) => (
          <Text key={step}>
            {`${index + 1}.  `}
            {t(`tools.swim.guide.${step}`)}
          </Text>
        ))}
      </Card>

      <DurationField
        label={t('tools.swim.time400')}
        value={time400.parts}
        onChange={time400.setParts}
        onBlur={time400.onBlur}
        unitLabels={unitLabels}
        accessibilityLabels={accessibilityLabels}
        error={fieldError(time400, 'time400Sec', issues, formatDuration)}
      />
      <DurationField
        label={t('tools.swim.time200')}
        value={time200.parts}
        onChange={time200.setParts}
        onBlur={time200.onBlur}
        unitLabels={unitLabels}
        accessibilityLabels={accessibilityLabels}
        error={fieldError(time200, 'time200Sec', issues, formatDuration)}
      />

      {result.ok ? (
        <Reveal>
          <Card>
            <ResultHeader
              label={t('tools.swim.cssLabel')}
              value={t('units.paceValue', {
                pace: formatDuration(result.value.cssPacePer100mSec),
                unit: per100,
              })}
              note={t('tools.swim.cssNote')}
            />
          </Card>
          <Text variant="heading">{t('tools.swim.zonesTitle')}</Text>
          <ZoneTable rows={paceRows(result.value.zones, per100)} />
        </Reveal>
      ) : null}
    </Screen>
  );
}
