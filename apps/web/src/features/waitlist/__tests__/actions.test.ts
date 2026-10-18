import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const insert = vi.fn();
const getSupabase = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => getSupabase() }));

const { joinWaitlist } = await import('../actions');

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const idle = { status: 'idle' } as const;
const valid = { email: 'Ana@Example.com', consent: 'on' };

describe('joinWaitlist', () => {
  beforeEach(() => {
    insert.mockReset().mockResolvedValue({ error: null });
    getSupabase.mockReset().mockReturnValue({ from: () => ({ insert }) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('stores the email with consent, consent text and source', async () => {
    // The mocked insert result has no `.select()`, so this also fails if the row is requested back.
    expect(await joinWaitlist(idle, form(valid))).toEqual({ status: 'success' });
    expect(insert).toHaveBeenCalledWith({
      email: 'ana@example.com',
      consent: true,
      consent_text: expect.stringContaining('I agree'),
      source: 'home',
      locale: 'en',
    });
  });

  it('treats an address that is already on the list as success', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    expect(await joinWaitlist(idle, form(valid))).toEqual({ status: 'success' });
  });

  it('reports other database errors', async () => {
    insert.mockResolvedValue({ error: { code: '42501', message: 'denied' } });
    expect(await joinWaitlist(idle, form(valid))).toMatchObject({ error: 'unavailable' });
  });

  it('does not store invalid input or bot submissions', async () => {
    expect(await joinWaitlist(idle, form({ email: 'nope' }))).toMatchObject({
      error: 'invalidEmail',
    });
    expect(await joinWaitlist(idle, form({ ...valid, company: 'x' }))).toEqual({
      status: 'success',
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it('fails gracefully when Supabase is not configured', async () => {
    getSupabase.mockReturnValue(null);
    expect(await joinWaitlist(idle, form(valid))).toMatchObject({ error: 'unavailable' });
  });
});
