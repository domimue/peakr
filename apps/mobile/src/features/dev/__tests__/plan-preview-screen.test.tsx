import { workoutLibrary } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import SettingsScreen from '../../../../app/settings';

import * as repo from '@/data/repositories/plan-repository';
import { enMessages as en } from '@/i18n/messages';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { PlanPreviewScreen } from '../plan-preview-screen';

function lookup(key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], en);
}

jest.mock('@/data/repositories/plan-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

describe('dev plan preview', () => {
  it('"Use as my plan" stores the preset as the plan, starting this week', async () => {
    mock.resetStore();
    const replace = jest.spyOn(router, 'replace').mockImplementation(() => undefined);
    await renderWithQuery(<PlanPreviewScreen />);
    await fireEvent.press(screen.getByText('Use as my plan'));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/plan'));
    const stored = mock.store.plan;
    expect(stored?.input.goal).toEqual({ kind: 'half' });
    expect(stored?.state.plan.weeks.length).toBe(12);
    replace.mockRestore();
  });

  it('renders a generated 12-week plan', async () => {
    await renderWithQuery(<PlanPreviewScreen />);
    for (let week = 1; week <= 12; week++) {
      expect(screen.getByLabelText(`week-${week}`)).toBeOnTheScreen();
    }
    expect(screen.queryByLabelText('week-13')).toBeNull();
    expect(screen.getAllByText(/run\.long/).length).toBeGreaterThan(0);
  });

  it('switches presets, e.g. to the 70.3 triathlon with bricks', async () => {
    await renderWithQuery(<PlanPreviewScreen />);
    await fireEvent.press(screen.getByText('70.3 triathlon'));
    expect(screen.getByLabelText('week-12')).toBeOnTheScreen();
    expect(screen.getAllByText(/· brick/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/swim\./).length).toBeGreaterThan(0);
  });

  it('is linked from the settings in development builds', async () => {
    const push = jest.spyOn(router, 'push').mockImplementation(() => undefined);
    await renderWithQuery(<SettingsScreen />);
    await fireEvent.press(await screen.findByText('Plan preview (dev)'));
    expect(push).toHaveBeenCalledWith('/dev/plan');
  });

  it('has a translation for every "why" text and scheduler note of the library', () => {
    for (const t of workoutLibrary) expect(typeof lookup(t.whyKey)).toBe('string');
    for (const key of ['recoveryWeek', 'taperWeek', 'downgraded', 'loadCap', 'benchmark']) {
      expect(typeof lookup(`notes.${key}`)).toBe('string');
    }
  });
});
