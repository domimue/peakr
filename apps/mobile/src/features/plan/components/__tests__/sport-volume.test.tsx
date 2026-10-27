import type { WeekProgress } from '@peakr/engine';
import { render, screen } from '@testing-library/react-native';

import { useSettingsStore } from '@/features/settings/settings-store';

import { SportVolumeLines } from '../sport-volume';

const progress = (bySport: WeekProgress['bySport']): WeekProgress => ({
  segments: [],
  sessionsDone: 1,
  sessionsPlanned: 4,
  kmDone: 0,
  kmPlanned: 0,
  minMin: 0,
  maxMin: 0,
  complete: false,
  minutesDone: 50,
  minutesPlanned: 310,
  bySport,
});

describe('week volume per sport', () => {
  afterEach(() => useSettingsStore.setState({ units: 'metric' }));

  it('time across sports; one line per sport in its own unit – never one mixed distance', async () => {
    await render(
      <SportVolumeLines
        testID="v"
        progress={progress([
          { sport: 'run', unit: 'km', done: 18, planned: 29 },
          { sport: 'bike', unit: 'km', done: 0, planned: 60 },
          { sport: 'swim', unit: 'm', done: 1500, planned: 2400 },
          { sport: 'strength', unit: 'sessions', done: 1, planned: 2 },
        ])}
      />,
    );
    expect(screen.getByText('50 min / 5 h 10 min')).toBeOnTheScreen();
    expect(screen.getByTestId('v-run')).toHaveTextContent('Running 18 / 29 km');
    expect(screen.getByTestId('v-bike')).toHaveTextContent('Riding 0 / 60 km');
    expect(screen.getByTestId('v-swim')).toHaveTextContent('Swimming 1500 / 2400 m');
    expect(screen.getByTestId('v-strength')).toHaveTextContent('Strength 1 / 2 sessions');
  });

  it('one endurance sport: just its distance; imperial in miles and yards', async () => {
    useSettingsStore.setState({ units: 'imperial' });
    await render(
      <SportVolumeLines
        progress={progress([{ sport: 'run', unit: 'km', done: 16.1, planned: 32.2 }])}
      />,
    );
    expect(screen.getByText('Distance 10 / 20 mi')).toBeOnTheScreen();
    await render(
      <SportVolumeLines
        testID="s"
        progress={progress([
          { sport: 'run', unit: 'km', done: 0, planned: 8 },
          { sport: 'swim', unit: 'm', done: 0, planned: 1000 },
        ])}
      />,
    );
    expect(screen.getByTestId('s-swim')).toHaveTextContent('Swimming 0 / 1100 yd');
  });
});
