import { vi } from 'vitest';

/**
 * A tiny stand-in for the Supabase admin client: every query chain resolves to the result the
 * test registered for `table:operation` (or the rpc name), and every call is recorded.
 */
export interface Call {
  table: string;
  op: string;
  payload?: unknown;
  filters: [string, string, unknown][];
}

export function fakeSupabase(results: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const resultOf = (key: string, call: Call) => {
    const r = results[key];
    return typeof r === 'function'
      ? (r as (call: Call) => unknown)(call)
      : (r ?? { data: null, error: null });
  };
  const chain = (call: Call) => {
    const key = `${call.table}:${call.op}`;
    const q: Record<string, unknown> = {};
    for (const m of [
      'eq',
      'is',
      'not',
      'in',
      'gt',
      'gte',
      'lte',
      'order',
      'limit',
      'select',
      'returns',
    ]) {
      q[m] = (...args: unknown[]) => {
        if (!['select', 'order', 'limit', 'returns'].includes(m)) {
          call.filters.push([m, String(args[0]), args.length > 2 ? args[2] : args[1]]);
        }
        return q;
      };
    }
    q.maybeSingle = () => Promise.resolve(resultOf(key, call));
    q.single = q.maybeSingle;
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(resultOf(key, call)).then(resolve, reject);
    return q;
  };
  const client = {
    from: (table: string) => {
      const start = (op: string) => (payload?: unknown) => {
        const call: Call = { table, op, payload, filters: [] };
        calls.push(call);
        return chain(call);
      };
      return {
        select: start('select'),
        insert: start('insert'),
        upsert: start('upsert'),
        update: start('update'),
        delete: start('delete'),
      };
    },
    rpc: vi.fn((name: string, args: unknown) => {
      const call: Call = { table: 'rpc', op: name, payload: args, filters: [] };
      calls.push(call);
      return chain(call);
    }),
    auth: {
      admin: {
        deleteUser: vi.fn(async () => ({ error: null })),
        getUserById: vi.fn(async (id: string) => ({
          data: {
            user: { id, is_anonymous: (results.anonymous as string[] | undefined)?.includes(id) },
          },
          error: null,
        })),
      },
    },
  };
  return { client, calls };
}
