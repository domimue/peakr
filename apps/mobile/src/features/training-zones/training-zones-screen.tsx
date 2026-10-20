import {
  analyzeRaceResult,
  calculateCss,
  defaultHrMethod,
  formatDuration,
  HR_ZONE_METHODS,
  REFERENCE_RACE_IDS,
  type HrZoneMethod,
  type ReferenceRaceId,
  type ZoneNumber,
} from '@peakr/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Button,
  Card,
  DurationField,
  Screen,
  SegmentedControl,
  Text,
  TextField,
  ZoneTable,
} from '@/ui';

import { usePlan, usePlanActions } from '@/features/plan/queries';

import { useDurationField, useFieldError, useIntegerField } from './form';
import { useZoneFormat } from './format';
import { resolveTrainingZones, type ResolvedTrainingZones } from './resolve';
import { ResultHeader } from './result-header';
import {
  withZoneSettings,
  zoneSettingsOf,
  type HrZoneOverride,
  type PaceZoneOverride,
  type TrainingZoneSettings,
  type ZoneKind,
  type ZoneOverrides,
} from './settings';
import { ZoneOverrideEditor } from './zone-override-editor';

interface Editing {
  kind: ZoneKind;
  zone: ZoneNumber;
}

/**
 * Profile → Training zones: shows the user's HR, pace and swim zones and lets them change the
 * inputs, the HR method and single zones. The zones are stored with the plan input, so saving
 * updates every target the plan shows (bpm, pace limits, CSS) at once.
 */
export function TrainingZonesScreen() {
  const { t } = useTranslation();
  const { data: stored, isPending } = usePlan();
  const actions = usePlanActions();
  if (isPending) return <Screen />;
  if (!stored) {
    return (
      <Screen>
        <Text tone="secondary">{t('trainingZones.noPlan')}</Text>
      </Screen>
    );
  }
  const save = (settings: TrainingZoneSettings, zones: ResolvedTrainingZones) =>
    actions.updateZones(
      withZoneSettings(stored.input, settings, {
        thresholdPaceSecPerKm: zones.run?.ok ? zones.run.value.thresholdPaceSecPerKm : undefined,
        cssPacePer100mSec: zones.swim?.ok ? zones.swim.value.cssPacePer100mSec : undefined,
      }),
    ).ok;
  return <ZonesForm key={stored.id} saved={zoneSettingsOf(stored.input)} onSave={save} />;
}

interface ZonesFormProps {
  saved: TrainingZoneSettings;
  /** Returns whether the zones were saved. */
  onSave: (settings: TrainingZoneSettings, zones: ResolvedTrainingZones) => boolean;
}

function ZonesForm({ saved, onSave }: ZonesFormProps) {
  const { t } = useTranslation();
  const fieldError = useFieldError();
  const { hrRows, paceRows } = useZoneFormat();

  const [pickedMethod, setPickedMethod] = useState<HrZoneMethod | null>(saved.hrMethod);
  const age = useIntegerField(saved.age);
  const hrMax = useIntegerField(saved.hrMax);
  const restingHr = useIntegerField(saved.restingHr);
  const lthr = useIntegerField(saved.lthr);
  const [distance, setDistance] = useState<ReferenceRaceId>(saved.runReference?.distance ?? '10k');
  const raceTime = useDurationField({ showHours: true, initialSec: saved.runReference?.timeSec });
  const time400 = useDurationField({ showHours: false, initialSec: saved.swimTest?.time400Sec });
  const time200 = useDurationField({ showHours: false, initialSec: saved.swimTest?.time200Sec });
  const [overrides, setOverrides] = useState<ZoneOverrides>(saved.overrides);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [showSaveErrors, setShowSaveErrors] = useState(false);

  // HR inputs: only the fields visible for the chosen method are used and saved.
  const method = pickedMethod ?? defaultHrMethod({ restingHr: restingHr.value });
  const usesLthr = method === 'lthr';
  const showResting = !usesLthr && (method === 'karvonen' || pickedMethod === null);

  // Run and swim are only checked once the user started entering a result.
  const runCheck = raceTime.empty ? null : analyzeRaceResult({ distance, timeSec: raceTime.value });
  const swimEntered = !time400.empty || !time200.empty;
  const swimCheck = swimEntered
    ? calculateCss({ time400Sec: time400.value, time200Sec: time200.value })
    : null;

  const draft: TrainingZoneSettings = {
    hrMethod: pickedMethod,
    age: usesLthr ? undefined : age.value,
    hrMax: hrMax.value,
    restingHr: showResting ? restingHr.value : undefined,
    lthr: usesLthr ? lthr.value : undefined,
    runReference:
      runCheck?.ok && raceTime.value !== undefined
        ? { distance, timeSec: raceTime.value }
        : undefined,
    swimTest:
      swimCheck?.ok && time400.value !== undefined && time200.value !== undefined
        ? { time400Sec: time400.value, time200Sec: time200.value }
        : undefined,
    overrides,
  };
  const zones = resolveTrainingZones(draft);
  const snapshot = JSON.stringify(draft);

  const hrIssues = zones.hr && !zones.hr.ok ? zones.hr.issues : [];
  const runIssues = runCheck && !runCheck.ok ? runCheck.issues : [];
  const swimIssues = swimCheck && !swimCheck.ok ? swimCheck.issues : [];
  const fields = [age, hrMax, restingHr, lthr, raceTime, time400, time200];
  const hasErrors =
    hrIssues.length + runIssues.length + swimIssues.length > 0 ||
    fields.some((f) => f.parseError !== undefined);

  const perKm = t('units.perKm');
  const per100 = t('units.per100m');
  const pace = (sec: number, unit: string) =>
    t('units.paceValue', { pace: formatDuration(sec), unit });
  const unitLabels = { h: t('units.h'), m: t('units.min'), s: t('units.s') };
  const accessibilityLabels = { h: t('units.hours'), m: t('units.minutes'), s: t('units.seconds') };

  function setOverride(kind: ZoneKind, zone: ZoneNumber, value: HrZoneOverride | PaceZoneOverride) {
    setOverrides((prev) => ({ ...prev, [kind]: { ...prev[kind], [zone]: value } }));
    setEditing(null);
  }

  function resetOverride(kind: ZoneKind, zone: ZoneNumber) {
    setOverrides((prev) => {
      const next = { ...prev[kind] };
      delete next[zone];
      return { ...prev, [kind]: next };
    });
    setEditing(null);
  }

  function handleSave() {
    if (hasErrors) {
      fields.forEach((f) => f.onBlur());
      setShowSaveErrors(true);
      return;
    }
    if (!onSave(draft, zones)) return;
    setSavedSnapshot(snapshot);
    setShowSaveErrors(false);
  }

  function editor(
    kind: ZoneKind,
    list: readonly { zone: ZoneNumber; custom: boolean }[],
    range: (zone: ZoneNumber) => { lower: number | null; upper: number | null },
  ) {
    if (editing?.kind !== kind) return null;
    const zone = editing.zone;
    return (
      <ZoneOverrideEditor
        key={`${kind}-${zone}`}
        kind={kind}
        zone={zone}
        current={range(zone)}
        isCustom={list.some((z) => z.zone === zone && z.custom)}
        onApply={(value) => setOverride(kind, zone, value)}
        onReset={() => resetOverride(kind, zone)}
        onCancel={() => setEditing(null)}
      />
    );
  }

  const tableProps = (kind: ZoneKind) => ({
    customLabel: t('trainingZones.custom'),
    rowHint: t('trainingZones.rowHint'),
    onPressRow: (zone: ZoneNumber) => setEditing({ kind, zone }),
  });

  return (
    <Screen>
      <Text tone="secondary">{t('trainingZones.intro')}</Text>

      {/* Heart rate */}
      <Text variant="heading" accessibilityRole="header">
        {t('trainingZones.hr.title')}
      </Text>
      <SegmentedControl
        options={HR_ZONE_METHODS.map((m) => ({
          value: m,
          label: t(`trainingZones.hr.methods.${m}`),
        }))}
        value={method}
        onChange={setPickedMethod}
      />
      <Text tone="secondary">{t(`trainingZones.hr.methodInfo.${method}`)}</Text>
      {pickedMethod === null ? (
        <Text variant="caption" tone="secondary">
          {t('trainingZones.hr.autoMethod')}
        </Text>
      ) : null}

      {usesLthr ? (
        <TextField
          label={t('fields.lthr')}
          hint={t('fields.lthrHint')}
          value={lthr.text}
          onChangeText={lthr.setText}
          onBlur={lthr.onBlur}
          error={fieldError(lthr, 'lthr', hrIssues)}
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
          error={fieldError(age, 'age', hrIssues)}
          keyboardType="number-pad"
          maxLength={3}
          suffix={t('units.years')}
        />
      )}
      {showResting ? (
        <TextField
          label={method === 'karvonen' ? t('fields.restingHr') : t('fields.restingHrOptional')}
          hint={t('fields.restingHrHint')}
          value={restingHr.text}
          onChangeText={restingHr.setText}
          onBlur={restingHr.onBlur}
          error={fieldError(restingHr, 'restingHr', hrIssues)}
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
        error={fieldError(hrMax, 'hrMax', hrIssues)}
        keyboardType="number-pad"
        maxLength={3}
        suffix={t('units.bpm')}
      />

      {zones.hr?.ok ? (
        <>
          <Card>
            {zones.hr.value.hrMax !== null ? (
              <ResultHeader
                label={t('trainingZones.hr.hrMaxUsed')}
                value={t('units.bpmValue', { value: zones.hr.value.hrMax })}
                isEstimate={zones.hr.value.hrMaxIsEstimate}
                note={
                  zones.hr.value.hrMaxIsEstimate
                    ? t('trainingZones.hr.hrMaxEstimateNote')
                    : undefined
                }
              />
            ) : (
              <ResultHeader
                label={t('trainingZones.hr.lthrUsed')}
                value={t('units.bpmValue', { value: zones.hr.value.lthr })}
              />
            )}
          </Card>
          <ZoneTable rows={hrRows(zones.hr.value.zones)} {...tableProps('hr')} />
          {editor('hr', zones.hr.value.zones, (zone) => {
            const z = zones.hr?.ok ? zones.hr.value.zones[zone - 1] : undefined;
            return { lower: z?.minBpm ?? null, upper: z?.maxBpm ?? null };
          })}
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          {t('trainingZones.hr.empty')}
        </Text>
      )}

      {/* Running pace */}
      <Text variant="heading" accessibilityRole="header">
        {t('trainingZones.run.title')}
      </Text>
      <Text tone="secondary">{t('trainingZones.run.intro')}</Text>
      <SegmentedControl
        options={REFERENCE_RACE_IDS.map((id) => ({ value: id, label: t(`races.${id}`) }))}
        value={distance}
        onChange={setDistance}
      />
      <DurationField
        label={t('trainingZones.run.timeLabel', { distance: t(`races.${distance}`) })}
        value={raceTime.parts}
        onChange={raceTime.setParts}
        onBlur={raceTime.onBlur}
        showHours
        unitLabels={unitLabels}
        accessibilityLabels={accessibilityLabels}
        error={fieldError(raceTime, 'timeSec', runIssues, formatDuration)}
      />
      {zones.run?.ok ? (
        <>
          <Card>
            <ResultHeader
              label={t('trainingZones.run.thresholdPace')}
              value={pace(zones.run.value.thresholdPaceSecPerKm, perKm)}
              isEstimate
              note={t('trainingZones.run.thresholdNote')}
            />
          </Card>
          <ZoneTable rows={paceRows(zones.run.value.paceZones, perKm)} {...tableProps('runPace')} />
          {editor('runPace', zones.run.value.paceZones, (zone) => {
            const z = zones.run?.ok ? zones.run.value.paceZones[zone - 1] : undefined;
            return { lower: z?.slowestSec ?? null, upper: z?.fastestSec ?? null };
          })}
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          {t('trainingZones.run.empty')}
        </Text>
      )}

      {/* Swimming */}
      <Text variant="heading" accessibilityRole="header">
        {t('trainingZones.swim.title')}
      </Text>
      <Text tone="secondary">{t('trainingZones.swim.intro')}</Text>
      <DurationField
        label={t('trainingZones.swim.time400')}
        value={time400.parts}
        onChange={time400.setParts}
        onBlur={time400.onBlur}
        unitLabels={unitLabels}
        accessibilityLabels={accessibilityLabels}
        error={fieldError(time400, 'time400Sec', swimIssues, formatDuration)}
      />
      <DurationField
        label={t('trainingZones.swim.time200')}
        value={time200.parts}
        onChange={time200.setParts}
        onBlur={time200.onBlur}
        unitLabels={unitLabels}
        accessibilityLabels={accessibilityLabels}
        error={fieldError(time200, 'time200Sec', swimIssues, formatDuration)}
      />
      {zones.swim?.ok ? (
        <>
          <Card>
            <ResultHeader
              label={t('trainingZones.swim.cssLabel')}
              value={pace(zones.swim.value.cssPacePer100mSec, per100)}
              note={t('trainingZones.swim.cssNote')}
            />
          </Card>
          <ZoneTable rows={paceRows(zones.swim.value.zones, per100)} {...tableProps('swimPace')} />
          {editor('swimPace', zones.swim.value.zones, (zone) => {
            const z = zones.swim?.ok ? zones.swim.value.zones[zone - 1] : undefined;
            return { lower: z?.slowestSec ?? null, upper: z?.fastestSec ?? null };
          })}
        </>
      ) : (
        <Text variant="caption" tone="secondary">
          {t('trainingZones.swim.empty')}
        </Text>
      )}

      {showSaveErrors && hasErrors ? (
        <Text tone="danger" accessibilityLiveRegion="polite">
          {t('trainingZones.fixErrors')}
        </Text>
      ) : null}
      {savedSnapshot === snapshot ? (
        <Text accessibilityLiveRegion="polite">{t('trainingZones.saved')}</Text>
      ) : null}
      <Button label={t('trainingZones.save')} onPress={handleSave} />
    </Screen>
  );
}
