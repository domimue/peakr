import type { HrZone, Phase, PlanNote, Workout } from '@peakr/engine';
import {
  durationText,
  exerciseLines,
  structureLines,
  targetText,
  workoutTitle,
  type ForecastLine,
  type ForecastWeek,
  type PhaseSegment,
} from '@peakr/quiz';
import Link from 'next/link';

import { primaryButton, secondaryButton } from '@/components/ui';
import { messages } from '@/i18n';
import { tWorkout as t } from '@/i18n/workouts';

import { formatDay } from './format';
import type { FunnelPlan } from './plan';

const f = messages.funnel.forecast;

/** Params that are ids get translated (race distances), as in the app. */
function lineParams(line: ForecastLine | PlanNote) {
  const params: Record<string, string | number> = { ...line.params };
  for (const k of ['distance', 'reference'] as const) {
    if (typeof params[k] === 'string') params[k] = t(`races.${params[k]}`);
  }
  return params;
}

/** Phase → colour, reusing the zone scale (base easy … peak hard, taper light) like the app. */
const PHASE_CLASS: Record<Phase, string> = {
  base: 'bg-zone-2',
  maintain: 'bg-zone-2',
  build: 'bg-zone-3',
  peak: 'bg-zone-4',
  taper: 'bg-zone-1',
};

/**
 * The forecast after the quiz (CLAUDE.md "Web funnel flow" step 4): plan length, phases, weekly
 * load, the expected outcome and week 1 in full – all from the engine, the same content as the
 * app's forecast screen. The rest of the plan needs the trial.
 */
export function ForecastView({ result }: { result: FunnelPlan }) {
  const { forecast, plan, input, hrZones } = result;
  const week1 = plan.weeks[0];
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted">
          {t(`quiz.goal.options.${input.goal.kind}.label`)}
        </p>
        <h1 className="text-2xl sm:text-3xl">{t('quiz.forecast.title')}</h1>
        <p className="text-muted tabular-nums">
          {t('quiz.forecast.dates', {
            start: formatDay(forecast.startDate),
            end: formatDay(forecast.endDate),
          })}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            [forecast.weeks, 'quiz.forecast.weeks'],
            [forecast.sessions, 'quiz.forecast.sessions'],
            [forecast.recoveryWeeks, 'quiz.forecast.recoveryWeeks'],
          ] as const
        ).map(([value, key]) => (
          <div key={key} className="flex flex-col items-center rounded-2xl bg-surface p-4">
            <dd className="font-display text-2xl tabular-nums">{value}</dd>
            <dt className="text-center text-sm text-muted">{t(key)}</dt>
          </div>
        ))}
      </dl>

      <section className="flex flex-col gap-3 rounded-3xl border border-border p-5 sm:p-6">
        <h2 className="text-lg">{t('quiz.forecast.loadTitle')}</h2>
        <p className="text-sm text-muted">{t('quiz.forecast.loadHint')}</p>
        <LoadChart weeks={forecast.loads} maxLoad={forecast.maxLoad} />
        <PhaseStrip phases={forecast.phases} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg">{t('quiz.forecast.outcomeTitle')}</h2>
        <ul className="flex flex-col gap-2">
          {forecast.outcome.map((line) => (
            <li key={line.key} className="flex gap-2 leading-relaxed">
              <span aria-hidden="true">•</span>
              {t(line.key, lineParams(line))}
            </li>
          ))}
        </ul>
        {forecast.notes.map((note) => (
          <p key={note.key} className="text-sm text-muted">
            {`ⓘ ${t(note.key, lineParams(note))}`}
          </p>
        ))}
        <p className="text-sm text-muted">{t('quiz.forecast.basis')}</p>
      </section>

      {week1 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg">{t('quiz.forecast.week1Title')}</h2>
          <ul className="flex flex-col gap-3">
            {week1.workouts.map((w) => (
              <li key={w.id}>
                <WorkoutCard workout={w} hrZones={hrZones} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="theme-dark flex flex-col gap-4 rounded-3xl bg-background p-6 text-foreground sm:p-8">
        <h2 className="text-xl">{t('quiz.forecast.lockedTitle', { weeks: forecast.weeks - 1 })}</h2>
        <p className="text-muted">{t('quiz.forecast.trial')}</p>
        <Link href="/quiz/paywall" className={primaryButton}>
          {f.cta}
        </Link>
        <p className="text-sm text-muted">{f.ctaHint}</p>
      </section>
      <Link href="/quiz" className={`${secondaryButton} self-start`}>
        {t('quiz.forecast.editAnswers')}
      </Link>
    </div>
  );
}

/** Weekly load as bars that grow in one after another; recovery weeks are lighter. */
function LoadChart({ weeks, maxLoad }: { weeks: readonly ForecastWeek[]; maxLoad: number }) {
  const last = weeks[weeks.length - 1];
  return (
    <figure
      aria-label={t('quiz.forecast.chartLabel', {
        weeks: weeks.length,
        from: Math.round(weeks[0]?.load ?? 0),
        max: Math.round(maxLoad),
      })}
      className="flex flex-col gap-1"
    >
      <div aria-hidden="true" className="flex h-36 items-end gap-0.5 sm:gap-1">
        {weeks.map((w, i) => (
          <div
            key={w.index}
            className={`load-bar flex-1 rounded-t-sm ${PHASE_CLASS[w.phase]} ${w.isRecovery ? 'opacity-50' : ''}`}
            style={{
              height: `${Math.max(2, maxLoad > 0 ? (w.load / maxLoad) * 100 : 0)}%`,
              animationDelay: `${i * 35}ms`,
            }}
          />
        ))}
      </div>
      <figcaption aria-hidden="true" className="flex justify-between text-xs text-muted">
        <span>{t('quiz.forecast.weekShort', { week: 1 })}</span>
        {last ? <span>{t('quiz.forecast.weekShort', { week: last.index + 1 })}</span> : null}
      </figcaption>
    </figure>
  );
}

function PhaseStrip({ phases }: { phases: readonly PhaseSegment[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {phases.map((p) => (
        <li key={p.startWeek} className="flex items-center gap-2">
          <span aria-hidden="true" className={`size-3 rounded-sm ${PHASE_CLASS[p.phase]}`} />
          {t('quiz.forecast.phaseWeeks', {
            phase: t(`quiz.forecast.phases.${p.phase}`),
            count: p.weeks,
          })}
        </li>
      ))}
    </ul>
  );
}

function WorkoutCard({ workout: w, hrZones }: { workout: Workout; hrZones: readonly HrZone[] }) {
  const lines = w.sport === 'strength' ? exerciseLines(t, w) : structureLines(t, w);
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-sm text-muted">{formatDay(w.date)}</span>
          <h3 className="text-base font-semibold">{workoutTitle(t, w)}</h3>
        </div>
        {w.hard ? (
          <span className="rounded-full bg-surface-2 px-3 py-0.5 text-sm font-semibold">
            {t('quiz.forecast.hard')}
          </span>
        ) : null}
      </div>
      <p className="tabular-nums">
        {w.sport === 'strength'
          ? durationText(t, w)
          : `${durationText(t, w)} · ${targetText(t, w.target, hrZones)}`}
      </p>
      {lines.length > 0 ? (
        <ul className="flex flex-col gap-0.5 border-l-2 border-border pl-3 text-sm">
          {lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
      <p className="text-sm text-muted">{t(w.whyKey)}</p>
      {w.notes.map((note, i) => (
        <p key={`${note.key}-${i}`} className="text-sm text-muted">
          {`ⓘ ${t(note.key, { ...note.params })}`}
        </p>
      ))}
    </article>
  );
}
