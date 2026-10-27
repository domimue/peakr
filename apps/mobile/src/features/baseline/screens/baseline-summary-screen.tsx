import {
  calibrateProfile,
  startFloors,
  type BaselineResult,
  type BaselineOverrides,
  type Derived,
  type Experience,
  type HrZoneInput,
  type Sport,
} from '@peakr/engine';
import { prepareAnswers, QUESTION_IDS, sportsOf } from '@peakr/quiz';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { todayIso } from '@/data/ids';
import { localToday, useQuizStore } from '@/features/onboarding/quiz-store';
import { usePlan, usePlanActions } from '@/features/plan/queries';
import { Button, Card, Input, SegmentedControl, Screen, spacing, Text } from '@/ui';

import { useBaselineStore } from '../baseline-store';
import { applyCalibration, deriveCalibration, type CalibrationContext } from '../calibration';
import { paceText, parseMinSec, parseWhole, swimPaceText } from '../format';
import type { BaselineFlow } from './baseline-step';

const LEVELS: readonly Experience[] = ['beginner', 'intermediate', 'advanced'];

interface Context extends CalibrationContext {
  sports: readonly Sport[];
}

/** Who the calibration is for: the quiz answers so far, or the stored plan. */
function useCalibrationContext(flow: BaselineFlow): Context | null {
  const { answers, hydrate } = useQuizStore();
  const { data: plan } = usePlan();
  useEffect(() => {
    if (flow === 'onboarding') void hydrate();
  }, [flow, hydrate]);
  return useMemo(() => {
    if (flow === 'recalibrate') {
      if (!plan) return null;
      const { profile, hrZones } = plan.input;
      return { today: todayIso(), age: profile.age, hrZones, sports: profile.sports };
    }
    const today = localToday();
    const a = prepareAnswers(answers, today);
    const num = (id: string) => (typeof a[id] === 'number' ? (a[id] as number) : undefined);
    const hrZones: HrZoneInput = {
      ...(num(QUESTION_IDS.age) !== undefined ? { age: num(QUESTION_IDS.age) } : {}),
      ...(num(QUESTION_IDS.hrMax) !== undefined ? { hrMax: num(QUESTION_IDS.hrMax) } : {}),
      ...(num(QUESTION_IDS.restingHr) !== undefined
        ? { restingHr: num(QUESTION_IDS.restingHr) }
        : {}),
    };
    return { today, age: num(QUESTION_IDS.age), hrZones, sports: sportsOf(a) };
  }, [flow, plan, answers]);
}

/**
 * What Peakr derived from the selected activities, each value with how many activities it comes
 * from and editable – the user's entry always wins. Recalibration applies it to the plan.
 */
export function BaselineSummaryScreen({ flow }: { flow: BaselineFlow }) {
  const { t } = useTranslation();
  const { activities, meta, hydrated, hydrate, setOverride } = useBaselineStore();
  const ctx = useCalibrationContext(flow);
  const { data: plan } = usePlan();
  const actions = usePlanActions();

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const result = useMemo(
    () => (meta && ctx ? deriveCalibration(activities, meta, ctx) : null),
    [activities, meta, ctx],
  );

  if (!hydrated || !ctx) return <Screen />;
  if (!meta || !result) {
    return (
      <Screen title={flow === 'onboarding' ? t('baseline.summary.title') : undefined}>
        <Text>{t('baseline.select.empty')}</Text>
      </Screen>
    );
  }

  const o = meta.overrides;
  const set = setOverride;
  const done = () => {
    if (flow === 'recalibrate' && plan) {
      actions.recalibrate(applyCalibration(plan.input, result, meta));
    }
    router.back();
  };

  return (
    <Screen title={flow === 'onboarding' ? t('baseline.summary.title') : undefined}>
      <Text tone="secondary">
        {t('baseline.summary.intro', { count: result.activities, weeks: result.weeks })}
      </Text>
      <Text variant="caption" tone="secondary">
        {t('baseline.referenceOnly')}
      </Text>

      {result.sports
        .filter((s) => ctx.sports.includes(s.sport))
        .map((s) => (
          <Card key={s.sport}>
            <Text variant="heading">{t(`activities.sport.${s.sport}`)}</Text>
            <DerivedLine
              derived={s.volume}
              text={(v) =>
                t('baseline.summary.volume', {
                  sessions: v.sessionsPerWeek,
                  minutes: v.weeklyMin,
                  longest: v.longestMin,
                })
              }
            />
            {s.terrain?.status === 'ok' ? (
              <Text tone="secondary">
                {t('baseline.summary.terrain', {
                  terrain: t(`quiz.terrain.options.${s.terrain.value.terrain}.label`),
                  gain: s.terrain.value.gainPerKm,
                })}
              </Text>
            ) : null}
            <Text style={styles.label}>{t('baseline.summary.level')}</Text>
            <SegmentedControl
              options={LEVELS.map((l) => ({ value: l, label: t(`baseline.level.${l}`) }))}
              value={
                o.experience?.[s.sport] ??
                (s.experience.status === 'ok' ? s.experience.value : 'beginner')
              }
              onChange={(level) => set('experience', { ...o.experience, [s.sport]: level })}
            />
            <EditableValue
              label={t('baseline.summary.longSession')}
              hint={
                s.volume.status === 'ok'
                  ? s.volume.value.longSessions > 0
                    ? t('baseline.summary.longSessionFrom', { count: s.volume.value.longSessions })
                    : t('baseline.summary.longSessionFallback')
                  : undefined
              }
              derived={s.volume.status === 'ok' && s.volume.value.longMin > 0 ? s.volume : null}
              derivedText={(v) =>
                v.longKm === null
                  ? t('baseline.summary.minutes', { value: v.longMin })
                  : t('baseline.summary.longSessionValue', { minutes: v.longMin, km: v.longKm })
              }
              own={o.longMin?.[s.sport]}
              ownText={(v) => t('baseline.summary.minutes', { value: v })}
              placeholder="60"
              parse={parseWhole}
              onSave={(v) => {
                const longMin = { ...o.longMin };
                if (v === undefined) delete longMin[s.sport];
                else longMin[s.sport] = v;
                set('longMin', Object.keys(longMin).length > 0 ? longMin : undefined);
              }}
            />
            <EditableValue
              label={t('baseline.summary.weeklyStart')}
              derived={s.volume.status === 'ok' ? s.volume : null}
              derivedText={(v) =>
                t('baseline.summary.weeklyStartValue', {
                  minutes: v.recentWeeklyMin,
                  km: v.recentWeeklyKm,
                })
              }
              own={o.weeklyMin?.[s.sport]}
              ownText={(v) => t('baseline.summary.minutes', { value: v })}
              placeholder="150"
              parse={parseWhole}
              onSave={(v) => {
                const weeklyMin = { ...o.weeklyMin };
                if (v === undefined) delete weeklyMin[s.sport];
                else weeklyMin[s.sport] = v;
                set('weeklyMin', Object.keys(weeklyMin).length > 0 ? weeklyMin : undefined);
              }}
            />
          </Card>
        ))}

      <PlanStart result={result} overrides={o} ctx={ctx} />

      <Card>
        <Text variant="heading">{t('baseline.summary.paces')}</Text>
        {ctx.sports.includes('run') ? (
          <>
            <EditableValue
              label={t('baseline.summary.easyPace')}
              derived={result.easyPaceSecPerKm}
              derivedText={(v) => paceText(t, v)}
              own={o.easyPaceSecPerKm}
              ownText={(v) => paceText(t, v)}
              placeholder="6:10"
              parse={parseMinSec}
              onSave={(v) => set('easyPaceSecPerKm', v)}
            />
            <DerivedLine
              derived={result.paceHr}
              text={(v) =>
                t('baseline.summary.paceHr', {
                  hr: v.referenceHr,
                  pace: paceText(t, v.paceAtReferenceSecPerKm),
                })
              }
            />
          </>
        ) : null}
        {ctx.sports.includes('swim') ? (
          <EditableValue
            label={t('baseline.summary.css')}
            hint={t('baseline.summary.cssHint')}
            derived={result.cssPacePer100mSec}
            derivedText={(v) => swimPaceText(t, v)}
            own={o.cssPacePer100mSec}
            ownText={(v) => swimPaceText(t, v)}
            placeholder="1:55"
            parse={parseMinSec}
            onSave={(v) => set('cssPacePer100mSec', v)}
          />
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">{t('baseline.summary.heartRate')}</Text>
        <EditableValue
          label={t('baseline.summary.hrMax')}
          hint={t('baseline.summary.hrMaxHint')}
          derived={result.hrMax}
          derivedText={(v) => t('units.bpmValue', { value: v })}
          own={o.hrMax}
          ownText={(v) => t('units.bpmValue', { value: v })}
          placeholder="185"
          parse={parseWhole}
          onSave={(v) => set('hrMax', v)}
        />
        <EditableValue
          label={t('baseline.summary.lthr')}
          derived={result.lthr}
          derivedText={(v) => t('units.bpmValue', { value: v })}
          own={o.lthr}
          ownText={(v) => t('units.bpmValue', { value: v })}
          placeholder="165"
          parse={parseWhole}
          onSave={(v) => set('lthr', v)}
        />
        <Text tone="secondary">{t('baseline.summary.restingHr')}</Text>
        <Text tone="secondary">
          {result.stravaHrZones
            ? t('baseline.summary.stravaZones')
            : meta.zonesScopeMissing
              ? t('baseline.summary.stravaZonesScope')
              : t('baseline.summary.stravaZonesDefault')}
        </Text>
      </Card>

      <Card>
        <Text variant="heading">{t('baseline.summary.week1')}</Text>
        <EditableValue
          label={t('baseline.summary.weeklyLoad')}
          hint={t('baseline.summary.weeklyLoadHint')}
          derived={result.weeklyLoad}
          derivedText={(v) => String(v)}
          own={o.weeklyLoad}
          ownText={(v) => String(v)}
          placeholder="300"
          parse={parseWhole}
          onSave={(v) => set('weeklyLoad', v)}
        />
      </Card>

      <Button
        label={flow === 'recalibrate' ? t('baseline.summary.apply') : t('baseline.summary.done')}
        onPress={done}
      />
    </Screen>
  );
}

/**
 * The values the plan actually starts from (CLAUDE.md "Baseline"): the engine's floors computed
 * from these numbers, so a wrong starting point is visible before the plan is built.
 */
function PlanStart({
  result,
  overrides,
  ctx,
}: {
  result: BaselineResult;
  overrides: BaselineOverrides;
  ctx: Context;
}) {
  const { t } = useTranslation();
  const floors = startFloors(
    calibrateProfile(
      {
        age: ctx.age ?? 40,
        experience: 'intermediate',
        sports: [...ctx.sports],
        terrain: 'rolling',
        strength: { mode: 'none' },
      },
      result,
      overrides,
    ),
  );
  const sports = ctx.sports.filter(
    (s) => floors.longMin[s] !== undefined || floors.weeklyMin[s] !== undefined,
  );
  if (sports.length === 0) return null;
  return (
    <Card testID="baseline-plan-start">
      <Text variant="heading">{t('baseline.summary.startsWith')}</Text>
      {sports.map((sport) => {
        const long = floors.longMin[sport];
        const volume = result.sports.find((x) => x.sport === sport)?.volume;
        const derived = volume?.status === 'ok' ? volume.value : null;
        // Distance of the floor from the typical long session's pace (a typed duration has none).
        const km =
          long !== undefined && derived?.longKm && overrides.longMin?.[sport] === undefined
            ? Math.round(((derived.longKm * long) / derived.longMin) * 10) / 10
            : null;
        const weekly = floors.weeklyMin[sport];
        return (
          <View key={sport} style={styles.startRow}>
            <Text style={styles.label}>{t(`activities.sport.${sport}`)}</Text>
            {long !== undefined ? (
              <Text>
                {km === null
                  ? t('baseline.summary.startsWithLongNoKm', { minutes: long })
                  : t('baseline.summary.startsWithLong', { minutes: long, km })}
              </Text>
            ) : null}
            {weekly !== undefined ? (
              <Text>{t('baseline.summary.startsWithVolume', { minutes: weekly })}</Text>
            ) : null}
          </View>
        );
      })}
      <Text variant="caption" tone="secondary">
        {t('baseline.summary.startsWithHint')}
      </Text>
    </Card>
  );
}

function countText(t: (k: never, o?: object) => string, d: Derived<unknown>): string {
  return d.status === 'ok'
    ? t('baseline.summary.from' as never, { count: d.count })
    : t('baseline.summary.notEnough' as never, { count: d.count, needed: d.needed });
}

/** A derived value that is shown only ("Easy pace around 6:10 /km, from 8 runs"). */
function DerivedLine<T>({ derived, text }: { derived: Derived<T>; text: (v: T) => string }) {
  const { t } = useTranslation();
  return (
    <Text tone={derived.status === 'ok' ? 'default' : 'secondary'}>
      {derived.status === 'ok'
        ? `${text(derived.value)} – ${countText(t as never, derived)}`
        : countText(t as never, derived)}
    </Text>
  );
}

interface EditableValueProps<T, V extends number> {
  label: string;
  hint?: string;
  derived: Derived<T> | null;
  derivedText: (v: T) => string;
  own: V | undefined;
  ownText: (v: V) => string;
  placeholder: string;
  parse: (text: string) => V | undefined;
  onSave: (v: V | undefined) => void;
}

/** One calibration value: derived (with its basis) or the user's own entry, which wins. */
function EditableValue<T, V extends number>(props: EditableValueProps<T, V>) {
  const { label, hint, derived, derivedText, own, ownText, placeholder, parse, onSave } = props;
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const parsed = parse(text);

  const value =
    own !== undefined
      ? `${ownText(own)} – ${t('baseline.summary.yourEntry')}`
      : derived === null
        ? t('baseline.summary.notEnoughShort')
        : derived.status === 'ok'
          ? `${derivedText(derived.value)} – ${countText(t as never, derived)}`
          : countText(t as never, derived);

  return (
    <View style={styles.value}>
      <Text style={styles.label}>{label}</Text>
      <Text tone={own !== undefined || derived?.status === 'ok' ? 'default' : 'secondary'}>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" tone="secondary">
          {hint}
        </Text>
      ) : null}
      {editing ? (
        <View style={styles.edit}>
          <Input
            value={text}
            onChangeText={setText}
            placeholder={placeholder}
            accessibilityLabel={label}
            keyboardType="numbers-and-punctuation"
            invalid={text.length > 0 && parsed === undefined}
          />
          <View style={styles.buttons}>
            <Button
              small
              label={t('baseline.summary.save')}
              disabled={parsed === undefined}
              onPress={() => {
                onSave(parsed);
                setEditing(false);
              }}
            />
            <Button
              small
              variant="secondary"
              label={t('baseline.summary.cancel')}
              onPress={() => setEditing(false)}
            />
          </View>
        </View>
      ) : (
        <View style={styles.buttons}>
          <Button
            small
            variant="secondary"
            label={t('baseline.summary.edit')}
            accessibilityLabel={`${t('baseline.summary.edit')}: ${label}`}
            onPress={() => {
              setText('');
              setEditing(true);
            }}
          />
          {own !== undefined ? (
            <Button
              small
              variant="secondary"
              label={t('baseline.summary.reset')}
              accessibilityLabel={`${t('baseline.summary.reset')}: ${label}`}
              onPress={() => onSave(undefined)}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: '600', marginTop: spacing.sm },
  value: { gap: spacing.xs },
  edit: { gap: spacing.sm },
  buttons: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  startRow: { gap: spacing.xs },
});
