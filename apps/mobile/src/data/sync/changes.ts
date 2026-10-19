/**
 * Repositories call `notifyLocalChange` after writing synced data; the background sync listens
 * and pushes shortly afterwards. Keeps the repositories free of any network code.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyLocalChange(): void {
  for (const listener of listeners) listener();
}

export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
