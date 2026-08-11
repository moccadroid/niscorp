import { Fragment, useMemo, useState } from 'react';
import { occurrencesBetween, zonedParts } from '@niscorp/tide';
import type { Clock } from '@niscorp/tide';

// The part a naive scheduler destroys a business with.
//
// Occurrence identity is LOCAL CALENDAR FIELDS — `2026-03` for a monthly run,
// `2026-03-29` for a daily one — never an instant. A DST transition can move
// the instant a key fires at; it cannot mint a second key or lose one. So the
// double-fire and the silent skip are structurally impossible rather than
// carefully avoided.
//
// Pick a case and read the two columns: the KEY never repeats, while the UTC
// instant behind it shifts by an hour across the boundary.

type Case = { id: string; label: string; clock: Clock; from: number; to: number; hint: string };

const SPRING: Case = {
  id: 'spring',
  label: 'Spring forward — Vienna, 29 March',
  clock: { every: 'day', at: '03:00', tz: 'Europe/Vienna' },
  from: Date.UTC(2026, 2, 27, 0, 0),
  to: Date.UTC(2026, 2, 31, 23, 0),
  hint: 'The clock jumps 02:00 → 03:00. Five local dates, five keys, and the UTC instant moves back an hour once CEST begins.',
};

const CASES: readonly Case[] = [
  SPRING,
  {
    id: 'autumn',
    label: 'Fall back — Vienna, 25 October',
    clock: { every: 'day', at: '02:30', tz: 'Europe/Vienna' },
    from: Date.UTC(2026, 9, 23, 0, 0),
    to: Date.UTC(2026, 9, 27, 23, 0),
    hint: '02:30 happens TWICE on the 25th. One key, and it resolves to the first occurrence — never both.',
  },
  {
    id: 'month-end',
    label: 'Day 31, across February',
    clock: { every: 'month', on: 31, at: '03:00', tz: 'Europe/Vienna' },
    from: Date.UTC(2026, 0, 1, 0, 0),
    to: Date.UTC(2026, 4, 1, 0, 0),
    hint: 'Day 31 clamps to month end — February bills on the 28th, because "skip February" is never what a billing rule means.',
  },
  {
    id: 'zones',
    label: '03:00 local, Vienna vs Denver',
    clock: { every: 'day', at: '03:00', tz: 'America/Denver' },
    from: Date.UTC(2026, 2, 6, 0, 0),
    to: Date.UTC(2026, 2, 10, 23, 0),
    hint: 'The same reflex authored in another tenant\'s timezone. Same keys, different instants — and Denver springs forward a fortnight before Vienna.',
  },
];

const C = {
  wrap: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: 20, fontSize: 13 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap' as const },
  tab: (on: boolean) => ({
    padding: '5px 11px',
    borderRadius: 7,
    border: '1px solid',
    borderColor: on ? 'rgba(129,140,248,0.6)' : 'var(--sr-border, #2a2a33)',
    background: on ? 'rgba(129,140,248,0.16)' : 'transparent',
    color: 'inherit',
    font: 'inherit',
    fontSize: 12,
    cursor: 'pointer',
  }),
  panel: { border: '1px solid var(--sr-border, #2a2a33)', borderRadius: 10, overflow: 'hidden' as const },
  head: {
    padding: '8px 12px',
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
    opacity: 0.6,
    borderBottom: '1px solid var(--sr-border, #2a2a33)',
  },
  grid: { display: 'grid', gridTemplateColumns: 'auto 1fr 1fr', gap: 0 },
  cell: { padding: '7px 12px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, borderTop: '1px solid var(--sr-border, #2a2a33)' },
  label: { padding: '7px 12px', fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase' as const, opacity: 0.5 },
  key: { padding: '7px 12px', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, borderTop: '1px solid var(--sr-border, #2a2a33)', color: 'rgb(129,140,248)' },
  hint: { fontSize: 12, opacity: 0.65, lineHeight: 1.55 },
  clock: { fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, opacity: 0.75 },
};

export const Demo = () => {
  const [active, setActive] = useState<Case>(SPRING);

  const rows = useMemo(() => {
    const found = occurrencesBetween(active.clock, active.from, active.to, 40);
    return found.map((occurrence) => {
      const local = zonedParts(occurrence.at, 'tz' in active.clock ? active.clock.tz : 'UTC');
      return {
        key: occurrence.key,
        local: `${String(local.year)}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
        utc: new Date(occurrence.at).toISOString().slice(0, 16).replace('T', ' '),
      };
    });
  }, [active]);

  const duplicates = rows.length - new Set(rows.map((row) => row.key)).size;

  return (
    <div style={C.wrap}>
      <div style={C.tabs}>
        {CASES.map((item) => (
          <button key={item.id} style={C.tab(item.id === active.id)} onClick={() => setActive(item)}>
            {item.label}
          </button>
        ))}
      </div>

      <div style={C.hint}>{active.hint}</div>
      <div style={C.clock}>{JSON.stringify(active.clock)}</div>

      <div style={C.panel}>
        <div style={C.head}>
          {rows.length} occurrences · {duplicates === 0 ? 'no key repeats, none lost' : `${duplicates} DUPLICATE KEYS`}
        </div>
        <div style={C.grid}>
          <div style={C.label}>occurrence key</div>
          <div style={C.label}>local wall clock</div>
          <div style={C.label}>utc instant</div>
          {rows.map((row) => (
            <Fragment key={row.key}>
              <div style={C.key}>{row.key}</div>
              <div style={C.cell}>{row.local}</div>
              <div style={C.cell}>{row.utc}Z</div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};
