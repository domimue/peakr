import type { GymSession, GymSet } from '@peakr/engine';

import { postToStrava } from '../strava-api';
import { shareSession, shareToStrava, useShareStore } from '../share-store';

jest.mock('@/data/repositories/share-repository');
jest.mock('@/data/repositories/baseline-repository');
jest.mock('../strava-api', () => ({
  postToStrava: jest.fn(async () => ({ ok: true, status: 'posted', activityId: '99' })),
  stravaUploadStatus: jest.fn(),
}));

const session: GymSession = {
  id: 's1',
  date: '2026-10-21',
  startedAt: Date.UTC(2026, 9, 21, 17),
  endedAt: Date.UTC(2026, 9, 21, 17, 45),
  title: 'Push',
  kind: 'detailed',
  source: 'app',
};
const sets: GymSet[] = [
  {
    id: 'a',
    sessionId: 's1',
    exerciseId: 'bench_press',
    setIndex: 0,
    setType: 'working',
    reps: 8,
    weightKg: 60,
    completed: true,
    loggedAt: session.startedAt,
  },
];
const data = { session, sets, custom: [] };

describe('sharing a finished session', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShareStore.setState({ states: {} });
  });

  it('posts nothing when both switches are off', () => {
    shareSession(data, { strava: false, health: false });
    expect(postToStrava).not.toHaveBeenCalled();
    expect(useShareStore.getState().states).toEqual({});
  });

  it('posts the structured upload and keeps the Strava activity id', async () => {
    await shareToStrava(data);
    expect(postToStrava).toHaveBeenCalledWith(
      's1',
      expect.objectContaining({ format: 'structured' }),
    );
    expect(useShareStore.getState().states.s1?.strava).toMatchObject({
      status: 'posted',
      remoteId: '99',
      format: 'structured',
    });
  });

  it('only sends the plain summary when asked for explicitly', async () => {
    await shareToStrava(data, { plain: true });
    expect(postToStrava).toHaveBeenCalledWith('s1', expect.objectContaining({ format: 'plain' }));
    expect(useShareStore.getState().states.s1?.strava?.format).toBe('plain');
  });
});
