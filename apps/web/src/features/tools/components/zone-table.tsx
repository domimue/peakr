import type { ZoneNumber } from '@peakr/engine';

import { messages } from '@/i18n';

export interface ZoneRow {
  zone: ZoneNumber;
  label: string;
  name: string;
  range: string;
  highlighted?: boolean;
}

// Full class names so Tailwind can see them at build time.
const ZONE_BAR: Record<ZoneNumber, string> = {
  1: 'bg-zone-1',
  2: 'bg-zone-2',
  3: 'bg-zone-3',
  4: 'bg-zone-4',
  5: 'bg-zone-5',
};

/** Training zones with a colour bar per zone; labels are text-coloured so they never rely on colour alone. */
export function ZoneTable({ rows, caption }: { rows: readonly ZoneRow[]; caption?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <table className="w-full border-collapse text-left">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead className="sr-only">
          <tr>
            <th scope="col">{messages.zones.zone}</th>
            <th scope="col">{messages.zones.range}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.zone}
              data-zone={row.zone}
              aria-current={row.highlighted ? 'true' : undefined}
              className={`border-t border-border first:border-t-0 ${
                row.highlighted ? 'bg-surface-2' : ''
              }`}
            >
              <th scope="row" className="relative py-3 pr-4 pl-5 font-normal">
                <span
                  aria-hidden
                  className={`absolute inset-y-0 left-0 w-1.5 ${ZONE_BAR[row.zone]}`}
                />
                <span className="block text-xs font-semibold text-muted">{row.label}</span>
                <span className="block">{row.name}</span>
              </th>
              <td className="py-3 pr-4 text-right font-semibold tabular-nums">{row.range}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
