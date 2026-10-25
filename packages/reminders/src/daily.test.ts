import { describe, expect, it } from 'vitest';

import {
  isDue,
  localClock,
  pickWorkout,
  reminderMessage,
  type NotificationSettingsRow,
  type PlanRow,
  type WorkoutRow,
} from './index';

const settings: NotificationSettingsRow = {
  user_id: 'u1',
  daily_reminder: true,
  reminder_minute: 420,
  time_zone: 'Europe/Zurich',
  weather_hint: true,
};

const plan: PlanRow = { id: 'p1', deleted: false, updated_at: '2026-10-20T10:00:00Z', pauses: [] };

const workout = (over: Partial<WorkoutRow> = {}): WorkoutRow => ({
  plan_id: 'p1',
  id: 'w1',
  date: '2026-10-26',
  status: 'planned',
  deleted: false,
  data: { sport: 'run', role: 'easy', durationMin: 50 },
  ...over,
});

describe('localClock', () => {
  it('uses the user time zone, also across the date line and DST', () => {
    // 05:30 UTC on Monday = 06:30 in Zurich (winter time), 22:30 Sunday in Los Angeles.
    const now = new Date('2026-10-26T05:30:00Z');
    expect(localClock(now, 'Europe/Zurich')).toEqual({ date: '2026-10-26', minute: 390 });
    expect(localClock(now, 'America/Los_Angeles')).toEqual({ date: '2026-10-25', minute: 1350 });
    expect(localClock(now, 'Pacific/Auckland')).toEqual({ date: '2026-10-26', minute: 1110 });
    // Summer time in Zurich: 05:30 UTC = 07:30.
    expect(localClock(new Date('2026-07-01T05:30:00Z'), 'Europe/Zurich').minute).toBe(450);
  });

  it('falls back to UTC for an unknown time zone', () => {
    expect(localClock(new Date('2026-10-26T05:30:00Z'), 'Mars/Base')).toEqual({
      date: '2026-10-26',
      minute: 330,
    });
  });
});

describe('isDue', () => {
  it('sends from the reminder time on, within the window, only when turned on', () => {
    expect(isDue(settings, { date: '2026-10-26', minute: 419 })).toBe(false);
    expect(isDue(settings, { date: '2026-10-26', minute: 420 })).toBe(true);
    expect(isDue(settings, { date: '2026-10-26', minute: 599 })).toBe(true);
    expect(isDue(settings, { date: '2026-10-26', minute: 600 })).toBe(false);
    expect(isDue({ ...settings, daily_reminder: false }, { date: '2026-10-26', minute: 430 })).toBe(
      false,
    );
  });
});

describe('pickWorkout', () => {
  it('names the planned session of the day, the longest on a double day', () => {
    const short = workout({ id: 'swim', data: { sport: 'swim', durationMin: 30 } });
    const long = workout({ id: 'run', data: { sport: 'run', durationMin: 60 } });
    expect(pickWorkout([short, long], [plan], '2026-10-26')?.id).toBe('run');
  });

  it('skips rest days, commutes, done/skipped/deleted sessions and other days', () => {
    const rows = [
      workout({ id: 'c', data: { sport: 'bike', role: 'commute', commuteId: 'c1' } }),
      workout({ id: 'd', status: 'done' }),
      workout({ id: 's', status: 'skipped' }),
      workout({ id: 'x', deleted: true }),
      workout({ id: 'tomorrow', date: '2026-10-27' }),
    ];
    expect(pickWorkout(rows, [plan], '2026-10-26')).toBeNull();
  });

  it('uses only the current plan and respects pauses', () => {
    const old: PlanRow = { ...plan, id: 'p0', updated_at: '2026-01-01T00:00:00Z' };
    const rows = [workout({ plan_id: 'p0', id: 'old' }), workout()];
    expect(pickWorkout(rows, [old, plan], '2026-10-26')?.id).toBe('w1');
    expect(pickWorkout(rows, [{ ...plan, deleted: true }], '2026-10-26')).toBeNull();
    const paused = { ...plan, pauses: [{ startDate: '2026-10-24', endDate: null }] };
    expect(pickWorkout(rows, [paused], '2026-10-26')).toBeNull();
    const resumed = { ...plan, pauses: [{ startDate: '2026-10-20', endDate: '2026-10-26' }] };
    expect(pickWorkout(rows, [resumed], '2026-10-26')?.id).toBe('w1');
  });
});

describe('reminderMessage', () => {
  const day = {
    date: '2026-10-26',
    workout_id: 'w1',
    title: 'Today: Easy run, 50 min, Zone 2',
    body: 'Keep it conversational.',
    weather: 'Rain from 18:00 – treadmill option available.',
  };

  it('uses the app text with the weather line merged into the same push', () => {
    expect(reminderMessage(workout(), day, true)).toEqual({
      title: 'Today: Easy run, 50 min, Zone 2',
      body: 'Rain from 18:00 – treadmill option available.',
      workoutId: 'w1',
    });
    expect(reminderMessage(workout(), day, false).body).toBe('Keep it conversational.');
  });

  it('falls back to a plain text when the app text names another workout or is missing', () => {
    const moved = { ...day, workout_id: 'other' };
    expect(reminderMessage(workout(), moved, true)).toEqual({
      title: 'Today: Run, 50 min',
      body: 'Open Peakr for the steps and targets.',
      workoutId: 'w1',
    });
    expect(reminderMessage(workout({ data: { sport: 'strength' } }), null, true).title).toBe(
      'Today: Strength session',
    );
  });
});
