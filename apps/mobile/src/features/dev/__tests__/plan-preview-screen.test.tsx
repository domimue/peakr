import { workoutLibrary } from '@peakr/engine';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import ProfileScreen from '../../../../app/(tabs)/profile';

import en from '@/i18n/locales/en.json';

import { PlanPreviewScreen } from '../plan-preview-screen';

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

describe('dev plan preview', () => {
  it('renders a generated 12-week plan', async () => {
    await render(<PlanPreviewScreen />);
    for (let week = 1; week <= 12; week++) {
      expect(screen.getByLabelText(`week-${week}`)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText('week-13')).toBeNull();
    expect(screen.getAllByText(/run\.long/).length).toBeGreaterThan(0);
  });

  it('switches presets, e.g. to the 70.3 triathlon with bricks', async () => {
    await render(<PlanPreviewScreen />);
    await fireEvent.press(screen.getByText('70.3 triathlon'));
    expect(screen.getByLabelText('week-12')).toBeOnTheScreen();
    expect(screen.getAllByText(/· brick/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/swim\./).length).toBeGreaterThan(0);
  });

  it('is linked from the profile in development builds', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText('Plan preview (dev)'));
    expect(push).toHaveBeenCalledWith('/dev/plan');
  });

  it('has a translation for every "why" text and scheduler note of the library', () => {
    for (const t of workoutLibrary) expect(typeof lookup(t.whyKey)).toBe('string');
    for (const key of ['recoveryWeek', 'taperWeek', 'downgraded', 'loadCap', 'benchmark']) {
      expect(typeof lookup(`notes.${key}`)).toBe('string');
    }
  });
});
