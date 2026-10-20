/** In-memory baseline flags for Jest (`jest.mock('@/data/repositories/baseline-repository')`). */

export const store = { reconnectHint: false };

export const setReconnectHint = jest.fn(async () => {
  store.reconnectHint = true;
});
export const hasReconnectHint = jest.fn(async () => store.reconnectHint);
export const clearReconnectHint = jest.fn(async () => {
  store.reconnectHint = false;
});
