import type { Session } from '@supabase/supabase-js';
import { fireEvent, screen } from '@testing-library/react-native';
import { router } from 'expo-router';

import { useSessionStore } from '@/features/auth/session-store';
import { useCreatePlan } from '@/features/plan/queries';
import { renderWithQuery } from '@/test-utils/render-with-query';

import { PaywallScreen } from '../paywall-screen';

jest.mock('@/data/supabase', () => ({
  supabase: { auth: { onAuthStateChange: jest.fn() } },
}));
jest.mock('@/data/repositories/onboarding-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('@peakr/quiz', () => ({
  ...jest.requireActual('@peakr/quiz'),
  toPlanInput: () => ({
    ok: true,
    value: { profile: {}, goal: {}, availability: {}, startDate: '2026-10-19', hrZones: {} },
  }),
}));
jest.mock('@/features/plan/queries', () => ({ useCreatePlan: jest.fn() }));
jest.spyOn(router, 'replace').mockImplementation(() => undefined);

const session = (isAnonymous: boolean) =>
  useSessionStore.setState({
    session: { user: { id: 'user-1', is_anonymous: isAnonymous } } as unknown as Session,
    isAnonymous,
    ready: true,
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useCreatePlan).mockReturnValue({
    isPending: false,
    mutate: (_input: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.(),
  } as unknown as ReturnType<typeof useCreatePlan>);
});

describe('paywall', () => {
  it('sends an anonymous quiz user to sign-in after starting the plan', async () => {
    session(true);
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Start plan without purchase (development)'));
    expect(router.replace).toHaveBeenCalledWith('/auth/sign-in');
  });

  it('goes straight to Today for a signed-in account', async () => {
    session(false);
    await renderWithQuery(<PaywallScreen />);
    await fireEvent.press(screen.getByText('Start plan without purchase (development)'));
    expect(router.replace).toHaveBeenCalledWith('/today');
  });
});
