/** Dates on the funnel pages: ISO dates are calendar days, formatted without a time-zone shift. */
export function formatDay(iso: string, style: 'medium' | 'long' = 'medium'): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en', {
    dateStyle: style,
    timeZone: 'UTC',
  });
}

/** A timestamp (e.g. the trial end) as a calendar date in the visitor's region – UTC on the server. */
export function formatInstant(iso: string): string {
  return new Date(iso).toLocaleDateString('en', { dateStyle: 'long', timeZone: 'UTC' });
}
