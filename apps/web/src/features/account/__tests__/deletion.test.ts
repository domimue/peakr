import { describe, expect, it, vi } from 'vitest';

import { confirmsDeletion, requestDeletion } from '../deletion';

describe('account deletion on the website', () => {
  it('needs the exact confirmation word', () => {
    expect(confirmsDeletion('DELETE')).toBe(true);
    expect(confirmsDeletion('  DELETE ')).toBe(true);
    expect(confirmsDeletion('delete')).toBe(false);
    expect(confirmsDeletion('')).toBe(false);
    expect(confirmsDeletion(null)).toBe(false);
  });

  it('calls delete-account with the user JWT', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    await expect(
      requestDeletion('https://x.supabase.co/', 'pk', 'jwt', fetchImpl as typeof fetch),
    ).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith('https://x.supabase.co/functions/v1/delete-account', {
      method: 'POST',
      headers: { Authorization: 'Bearer jwt', apikey: 'pk' },
    });
  });

  it('reports a failed or unreachable function', async () => {
    const failing = vi.fn(async () => new Response('', { status: 500 }));
    await expect(requestDeletion('https://x', 'pk', 'jwt', failing as typeof fetch)).resolves.toBe(
      false,
    );
    const offline = vi.fn(async () => {
      throw new Error('offline');
    });
    await expect(requestDeletion('https://x', 'pk', 'jwt', offline as typeof fetch)).resolves.toBe(
      false,
    );
  });
});
