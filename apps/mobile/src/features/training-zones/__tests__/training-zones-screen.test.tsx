import { generatePlan } from '@peakr/engine';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { StoredPlanInput } from '@/data/db/schema';
import * as repo from '@/data/repositories/plan-repository';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { TrainingZonesScreen } from '../training-zones-screen';

jest.mock('@/data/repositories/plan-repository');
jest.mock('@/data/repositories/baseline-repository');

const mock = repo as unknown as typeof import('@/data/repositories/__mocks__/plan-repository');

const input: StoredPlanInput = {
  profile: {
    age: 30,
    experience: 'intermediate',
    sports: ['run'],
    terrain: 'flat',
    strength: { mode: 'none' },
  },
  goal: { kind: 'half' },
  availability: { minutesPerDay: [60, 60, 45, 60, 0, 120, 90], doublesAllowed: false },
  targetDate: '2027-02-14',
};

function storePlan(over: Partial<StoredPlanInput> = {}) {
  const r = generatePlan(input.profile, input.goal, input.availability, '2026-10-19', '2027-02-14');
  if (!r.ok) throw new Error('plan');
  mock.store.plan = {
    id: 'plan-1',
    input: { ...input, ...over },
    state: { plan: r.value, status: {}, pauses: [], revision: 0 },
  };
}

const saved = () => {
  if (!mock.store.plan) throw new Error('no plan');
  return mock.store.plan;
};

beforeEach(() => {
  mock.resetStore();
  jest.clearAllMocks();
});

describe('Training zones screen', () => {
  it('asks for a plan first', async () => {
    await renderWithQuery(<TrainingZonesScreen />);
    expect(await screen.findByText(/Build your plan first/)).toBeOnTheScreen();
  });

  it('shows %HRmax zones with an estimated HRmax after entering the age', async () => {
    storePlan();
    await renderWithQuery(<TrainingZonesScreen />);
    expect(
      await screen.findByText('Enter your age or max heart rate to see your heart rate zones.'),
    ).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Age'), '30');

    expect(screen.getByText('187 bpm')).toBeOnTheScreen();
    expect(screen.getByText('Estimate')).toBeOnTheScreen();
    expect(screen.getByText('112–130 bpm')).toBeOnTheScreen();
  });

  it('starts from the onboarding values and switches to LTHR on request', async () => {
    storePlan({ hrZones: { age: 30, restingHr: 60 } });
    await renderWithQuery(<TrainingZonesScreen />);
    expect(await screen.findByText('136–148 bpm')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('LTHR'));
    await fireEvent.changeText(screen.getByLabelText('Threshold heart rate (LTHR)'), '170');
    expect(screen.getByText('up to 144 bpm')).toBeOnTheScreen();
  });

  it('saves a manual zone and a race result into the plan input', async () => {
    storePlan({ hrZones: { age: 30 } });
    await renderWithQuery(<TrainingZonesScreen />);
    await fireEvent.press(await screen.findByLabelText('Z2 Endurance: 112–130 bpm'));
    await fireEvent.changeText(screen.getByLabelText('From'), '125');
    await fireEvent.changeText(screen.getByLabelText('To'), '140');
    await fireEvent.press(screen.getByText('Use these values'));
    expect(screen.getByText('125–140 bpm')).toBeOnTheScreen();
    expect(screen.getByText('Custom')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Your 10 km time, minutes'), '50');
    expect(screen.getByText('6:31 /km or slower')).toBeOnTheScreen();

    await fireEvent.press(screen.getByText('Save zones'));
    await waitFor(() =>
      expect(saved().input.zones?.overrides.hr[2]).toEqual({ minBpm: 125, maxBpm: 140 }),
    );
    expect(saved().input.hrZones).toEqual({ age: 30 });
    expect(saved().input.zones?.runReference).toEqual({ distance: '10k', timeSec: 3000 });
    expect(saved().input.profile.thresholdPaceSecPerKm).toBeGreaterThan(0);
    expect(screen.getByText("Saved. Your plan's targets now use these zones.")).toBeOnTheScreen();
  });

  it('shows the swim CSS from a test', async () => {
    storePlan();
    await renderWithQuery(<TrainingZonesScreen />);
    await fireEvent.changeText(await screen.findByLabelText('400 m time, minutes'), '6');
    await fireEvent.changeText(screen.getByLabelText('400 m time, seconds'), '40');
    await fireEvent.changeText(screen.getByLabelText('200 m time, minutes'), '3');
    await fireEvent.changeText(screen.getByLabelText('200 m time, seconds'), '10');
    expect(screen.getByText('1:45 /100 m')).toBeOnTheScreen();
  });

  it('rejects a reversed override and does not save invalid fields', async () => {
    storePlan();
    await renderWithQuery(<TrainingZonesScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Age'), '30');
    await fireEvent.press(screen.getByLabelText('Z3 Tempo: 131–149 bpm'));
    await fireEvent.changeText(screen.getByLabelText('From'), '150');
    await fireEvent.changeText(screen.getByLabelText('To'), '140');
    await fireEvent.press(screen.getByText('Use these values'));
    expect(screen.getByText('The lower limit must be below the upper limit.')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByLabelText('Age'), '5');
    await fireEvent.press(screen.getByText('Save zones'));
    expect(screen.getByText('Enter a value between 10 and 100.')).toBeOnTheScreen();
    expect(screen.getByText('Please fix the highlighted fields before saving.')).toBeOnTheScreen();
    expect(mock.savePlanState).not.toHaveBeenCalled();
  });
});
