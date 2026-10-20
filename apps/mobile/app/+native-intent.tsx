/**
 * GPX files opened with Peakr ("Open with" on Android, "Open in" / Files on iOS) arrive as a
 * file:// or content:// URL; they go to the route import. Everything else is routed as usual.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  if (/^(file|content):\/\//i.test(path)) return `/routes/import?uri=${encodeURIComponent(path)}`;
  return path;
}
