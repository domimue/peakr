import type { ShareState, StravaUpload } from '@peakr/engine';

import type { StravaPostResult, StravaStatusResult } from '../strava-api';
import { postSessionToStrava, splitError, type StravaRunnerDeps } from '../strava-runner';

const upload = { format: 'structured' } as StravaUpload;

function setup(post: StravaPostResult, statuses: StravaStatusResult[] = []) {
  const states: ShareState[] = [];
  const sleeps: number[] = [];
  const queue = [...statuses];
  const deps: StravaRunnerDeps = {
    post: jest.fn(async () => post),
    status: jest.fn(
      async (): Promise<StravaStatusResult> =>
        queue.shift() ?? { ok: true, status: 'processing', activityId: null },
    ),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    now: () => 1,
  };
  return { deps, states, sleeps, report: (s: ShareState) => states.push(s) };
}

describe('postSessionToStrava', () => {
  it('polls with growing delays until Strava returns an activity id', async () => {
    const t = setup({ ok: true, status: 'processing', activityId: null }, [
      { ok: true, status: 'processing', activityId: null },
      { ok: true, status: 'processing', activityId: null },
      { ok: true, status: 'posted', activityId: '123' },
    ]);
    await postSessionToStrava('s1', upload, t.report, t.deps);
    expect(t.states.map((s) => s.status)).toEqual(['posting', 'posted']);
    expect(t.states.at(-1)?.remoteId).toBe('123');
    expect(t.sleeps).toHaveLength(3);
    expect(Math.min(...t.sleeps)).toBeGreaterThanOrEqual(1000);
    expect(t.sleeps).toEqual([...t.sleeps].sort((a, b) => a - b));
  });

  it('asks for the scope upgrade instead of failing the connection', async () => {
    const t = setup({ ok: false, error: 'scope_missing' });
    await postSessionToStrava('s1', upload, t.report, t.deps);
    expect(t.states.at(-1)).toMatchObject({ status: 'needs_scope' });
    expect(t.deps.status).not.toHaveBeenCalled();
  });

  it('reports a Strava failure with its reason, and never falls back silently', async () => {
    const refused = setup({ ok: false, error: 'structured_unavailable', detail: 'bad data_type' });
    await postSessionToStrava('s1', upload, refused.report, refused.deps);
    expect(refused.states.at(-1)).toMatchObject({
      status: 'failed',
      format: 'structured',
      error: 'structured_unavailable: bad data_type',
    });

    const failed = setup({ ok: true, status: 'processing', activityId: null }, [
      { ok: true, status: 'failed', activityId: null, error: 'upload_failed: not strength' },
    ]);
    await postSessionToStrava('s1', upload, failed.report, failed.deps);
    expect(failed.states.at(-1)).toMatchObject({
      status: 'failed',
      error: 'upload_failed: not strength',
    });
  });

  it('keeps "posting" when Strava is still processing after the last poll', async () => {
    const t = setup({ ok: true, status: 'processing', activityId: null });
    await postSessionToStrava('s1', upload, t.report, t.deps);
    expect(t.states.at(-1)?.status).toBe('posting');
  });

  it('splits stored errors into code and detail', () => {
    expect(splitError('upload_failed: duplicate')).toEqual({
      code: 'upload_failed',
      detail: 'duplicate',
    });
    expect(splitError('reconnect')).toEqual({ code: 'reconnect' });
    expect(splitError(undefined)).toEqual({ code: 'upload_failed' });
  });
});
