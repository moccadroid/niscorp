import type { CSSProperties, JSX, ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { SIZE, TONE } from '../lib/tokens';
import { Icon } from './display';

// The one list primitive. Repeated structure is a data-driven `columns` spec on
// a generic component, never a new component per entity — so there is no
// IssueRow, no TaskRow and no StayRow anywhere in this app.

const Cell = z.object({
  kind: z.enum(['primary', 'text', 'chip', 'icon', 'action', 'switch']),
  key: z.string().optional(),
  toneKey: z.string().optional().describe('Row key holding the chip tone (neutral accent good warn alert).'),
  iconKey: z.string().optional(),
  subKey: z.string().optional().describe('Row key rendered under a primary cell.'),
  label: z.string().optional().describe('Static label for an action cell.'),
  ref: z.string().optional().describe('Ref fired by an action cell, with the whole row as payload.'),
  variant: z.string().optional(),
});

const RowsProps = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
    columns: z.array(z.object({ label: z.string().optional(), w: z.union([z.number(), z.literal('auto')]).optional(), cell: Cell })),
    rowKey: z.string().optional(),
    rowRef: z.string().optional().describe('Ref fired when a row is clicked, with the row as payload.'),
    selected: z.string().optional().describe('The `rowKey` value of the row currently open. Marks it, so a list says which of its rows the person is looking at.'),
    loading: z.boolean().optional(),
    empty: z.string().optional(),
    dense: z.boolean().optional(),
  })
  .strict();

export const Rows: NovaComponent<z.infer<typeof RowsProps>> = ({ rows = [], columns, rowKey = 'id', rowRef, selected, loading, empty = 'Nothing here.', dense }) => {
  const dispatch = useNovaDispatch();
  const grid = columns.map((c) => (c.w === 'auto' || c.w === undefined ? 'auto' : `${c.w}fr`)).join(' ');
  const pad = dense === true ? '9px 14px' : '13px 16px';
  const gap = dense === true ? 12 : 16;
  // The last column anchors to the table's right edge — timestamps, chips and
  // amounts read from the margin, headers included, so columns line up.
  const last = columns.length - 1;
  const anchor = (ci: number): CSSProperties => (ci === last ? { justifySelf: 'end', textAlign: 'right' } : {});

  // A LIST IS ITS OWN SURFACE. Every one of these used to be wrapped in a
  // `Card pad: 0` by its layout — eleven places writing the same zero to undo a
  // padding they did not want, because a table already insets its own cells and
  // a card around it would inset them twice. The knowledge that a list is flush
  // belongs to the list, so the card is here and the layouts say nothing.
  //
  // `overflow: hidden` is what makes the last row's border sit inside the
  // rounded corner instead of cutting across it.
  const surface = (inner: ReactNode): JSX.Element => (
    <div className="at-card" style={{ overflow: 'hidden' }}>
      {inner}
    </div>
  );

  if (loading === true) {
    return surface(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="at-skeleton" style={{ height: 34 }} />
        ))}
      </div>,
    );
  }
  if (rows.length === 0) {
    return surface(<div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--ink-faint)', fontSize: SIZE['sm'] }}>{empty}</div>);
  }

  const text = (row: Record<string, unknown>, key: string | undefined): string => {
    const v = key === undefined ? undefined : row[key];
    return v === undefined || v === null ? '' : String(v);
  };

  return surface(
    <>
      {columns.some((c) => c.label !== undefined && c.label !== '') ? (
        <div style={{ display: 'grid', gridTemplateColumns: grid, gap, padding: dense === true ? '6px 14px' : '8px 16px', borderBottom: '1px solid var(--line)' }}>
          {columns.map((c, i) => (
            <span key={i} style={{ fontSize: SIZE['xs'], textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 650, color: 'var(--ink-faint)', ...anchor(i) }}>
              {c.label ?? ''}
            </span>
          ))}
        </div>
      ) : null}
      {rows.map((row, ri) => {
        // Which row is open. A list that shows what a click opened, and does not
        // then say which row it was, makes the person re-read the record beside
        // it to find out where they are.
        const isOpen = selected !== undefined && selected !== '' && text(row, rowKey) === selected;
        return (
        <div
          key={text(row, rowKey) || String(ri)}
          className={cx('at-row', rowRef !== undefined && 'at-row--hover', isOpen && 'at-row--open')}
          style={{ display: 'grid', gridTemplateColumns: grid, gap, padding: pad, alignItems: 'center', borderBottom: '1px solid var(--line-soft)' }}
          onClick={rowRef !== undefined ? () => dispatch({ type: 'ui:click', ref: rowRef, payload: row }) : undefined}
        >
          {columns.map((c, ci) => {
            const cell = c.cell;
            if (cell.kind === 'primary') {
              return (
                <span key={ci} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0, ...anchor(ci) }}>
                  <span style={{ fontWeight: 570 }}>{text(row, cell.key)}</span>
                  {cell.subKey !== undefined && text(row, cell.subKey) !== '' ? <span style={{ fontSize: SIZE['sm'], color: 'var(--ink-mute)' }}>{text(row, cell.subKey)}</span> : null}
                </span>
              );
            }
            if (cell.kind === 'chip') {
              const tone = TONE[text(row, cell.toneKey)] ?? TONE['neutral']!;
              const label = text(row, cell.key);
              return label === '' ? <span key={ci} /> : (
                <span key={ci} style={anchor(ci)}>
                  <span className="at-chip" style={{ background: tone.bg, color: tone.fg }}>{label}</span>
                </span>
              );
            }
            if (cell.kind === 'icon') {
              return (
                <span key={ci} style={anchor(ci)}>
                  <Icon name={text(row, cell.iconKey) || 'dot'} size={17} color="mute" />
                </span>
              );
            }
            if (cell.kind === 'action') {
              return (
                <button
                  key={ci}
                  type="button"
                  className={cx('at-btn', `at-btn--${cell.variant ?? 'quiet'}`)}
                  style={{ padding: '5px 13px', fontSize: SIZE['sm'], ...anchor(ci) }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (cell.ref !== undefined) dispatch({ type: 'ui:click', ref: cell.ref, payload: row });
                  }}
                >
                  {cell.label ?? 'Open'}
                </button>
              );
            }
            if (cell.kind === 'switch') {
              // Same emission as `Switch`: the NEXT value, and the row it came
              // from. A list of things you flip is a list, not a bespoke
              // component per entity — which is what this one existed as before.
              const on = row[cell.key ?? ''] !== true;
              return (
                <span key={ci} style={anchor(ci)}>
                  <button
                    type="button"
                    aria-label={cell.label ?? 'Toggle'}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (cell.ref !== undefined) dispatch({ type: 'ui:click', ref: cell.ref, payload: { ...row, next: !on } });
                    }}
                  >
                    <span style={{ width: 40, height: 23, borderRadius: 999, background: on ? 'var(--accent)' : 'var(--line)', position: 'relative', transition: 'background 150ms ease', flexShrink: 0 }}>
                      <span style={{ position: 'absolute', top: 3, left: on ? 20 : 3, width: 17, height: 17, borderRadius: 999, background: '#fff', transition: 'left 150ms ease', boxShadow: '0 1px 2px rgba(0,0,0,.2)' }} />
                    </span>
                    {cell.label !== undefined ? <span style={{ fontSize: SIZE['sm'], color: 'var(--ink-mute)' }}>{cell.label}</span> : null}
                  </button>
                </span>
              );
            }
            return (
              <span key={ci} style={{ color: 'var(--ink-mute)', fontSize: SIZE['sm'], minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...anchor(ci) }}>
                {text(row, cell.key)}
              </span>
            );
          })}
        </div>
        );
      })}
    </>,
  );
};
Rows.meta = {
  description:
    'A data-driven list, on its own card — never wrap it in one. Columns are a spec; cells are primary / text / chip / icon / action / switch. `selected` marks the row that is open beside it. One component for every list in the app.',
  propsSchema: RowsProps,
};
