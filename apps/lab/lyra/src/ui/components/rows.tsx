import { Fragment, useState } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { COLOR, SIZE, TONE, WEIGHT } from '../lib/tokens';
import { Avatar, Badge, Bands, Dot, Icon, Meter } from './display';
import { Checkbox } from './forms';
import { Skeleton, Empty } from './feedback';
import { cx } from '../lib/cx';
import { fillPhrase } from '../lib/phrase';

type MenuItem = { label: string; ref: string; icon?: string; danger?: boolean; showKey?: string; hideKey?: string };

const Check = Checkbox as unknown as (props: { label?: string; checked?: boolean; novaRef?: string; payload?: unknown }) => React.ReactElement | null;

const CellSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), key: z.string(), color: z.enum(['ink', 'soft', 'mute', 'faint']).optional(), mono: z.boolean().optional(), wrap: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('primary'), key: z.string(), subKey: z.string().optional(), dotKey: z.string().optional().describe('Row key holding a tone token — the stream marker') }).strict(),
  z.object({ kind: z.literal('badge'), key: z.string(), toneKey: z.string().optional(), hueKey: z.string().optional(), showKey: z.string().optional().describe('Row key that must be true for the badge to appear') }).strict(),
  z.object({ kind: z.literal('bands'), key: z.string() }).strict(),
  // An icon by name, from the row or fixed on the column. For the leading
  // glyph a list of kinds wants — a class type, a source, a channel.
  z.object({ kind: z.literal('icon'), key: z.string().optional(), icon: z.string().optional(), hueKey: z.string().optional() }).strict(),
  // A quantity against its limit, drawn. Replaces "12 of 20" in a coloured
  // badge — the reader stops doing the division.
  z.object({ kind: z.literal('meter'), key: z.string(), maxKey: z.string(), captionKey: z.string().optional() }).strict(),
  // The overflow. Without it verbs eat the table — four of eight columns on
  // buttons — and a row on a phone is a button bar with a name squeezed in.
  z
    .object({
      kind: z.literal('menu'),
      items: z.array(z.object({ label: z.string(), ref: z.string(), icon: z.string().optional(), danger: z.boolean().optional(), showKey: z.string().optional(), hideKey: z.string().optional() })),
    })
    .strict(),
  z.object({ kind: z.literal('avatar'), key: z.string(), subKey: z.string().optional() }).strict(),
  z.object({ kind: z.literal('number'), key: z.string(), suffix: z.string().optional() }).strict(),
  z
    .object({
      kind: z.literal('action'),
      label: z.string(),
      ref: z.string(),
      variant: z.enum(['solid', 'accent', 'ghost', 'outline', 'danger']).optional(),
      // Two ways to say which rows get the control, because a spec should be
      // able to express "only the retired ones" without a layout branching.
      hideKey: z.string().optional().describe('Row key that, when true, HIDES the control for that row'),
      showKey: z.string().optional().describe('Row key that must be true for the control to appear'),
    })
    .strict(),
]);

const ColumnSchema = z
  .object({
    label: z.string(),
    w: z.union([z.number(), z.literal('auto')]).optional(),
    px: z.number().optional(),
    align: z.enum(['left', 'right']).optional(),
    // Which key this column sorts by. Present = the header is a button.
    sortable: z.string().optional(),
    cell: CellSchema,
  })
  .strict();

const RowsProps = z
  .object({
    rows: z.array(z.record(z.string(), z.unknown())).optional(),
    columns: z.array(ColumnSchema),
    rowKey: z.string(),
    loading: z.boolean().optional(),
    empty: z.string().optional(),
    emptyHint: z.string().optional(),
    emptyIcon: z.string().optional(),
    headers: z.boolean().optional(),
    onRowRef: z.string().optional().describe('Ref fired when a row is clicked; the payload is the whole row'),
    groupKey: z.string().optional(),
    // The component owns which header is live and which way; the ref carries
    // `{ key, dir }` and the caller re-reads.
    sortKey: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    onSortRef: z.string().optional(),
    // `selectedKeys` holds rowKey values; the ref fires with the row and the
    // next state. Without it a list cannot express a bulk act at all.
    selectRef: z.string().optional(),
    selectedKeys: z.array(z.string()).optional(),
  })
  .strict();

type RowsP = Partial<z.infer<typeof RowsProps>>;
type Row = Record<string, unknown>;

const str = (row: Row, key: string | undefined): string => {
  if (key === undefined) return '';
  // `fillPhrase` first: a counted phrase reaches an untranslated session as
  // its raw `{ phrase, slots }` shape (the pass that fills it only runs when
  // a book exists), and every cell that shows text goes through here.
  const v = fillPhrase(row[key]);
  return v === undefined || v === null ? '' : String(v);
};

const TONE_NAMES = ['neutral', 'accent', 'calm', 'warm', 'alert', 'good'] as const;
type ToneName = (typeof TONE_NAMES)[number];
const isTone = (value: string): value is ToneName => TONE_NAMES.some((name) => name === value);

const toneOf = (row: Row, key: string | undefined): ToneName => {
  const value = key === undefined ? '' : str(row, key);
  return isTone(value) ? value : 'neutral';
};

export const Rows: NovaComponent<Partial<z.infer<typeof RowsProps>>> = ({
  rows,
  columns,
  rowKey,
  loading,
  empty,
  emptyHint,
  emptyIcon,
  headers,
  onRowRef,
  groupKey,
  sortKey,
  sortDir,
  onSortRef,
  selectRef,
  selectedKeys,
}: RowsP) => {
  const dispatch = useNovaDispatch();
  const list = rows ?? [];
  const cols = columns ?? [];
  const key = rowKey ?? 'id';

  const selected = new Set(selectedKeys ?? []);
  const selectable = selectRef !== undefined;

  if (loading === true) return <div style={{ padding: 16 }}><Skeleton lines={4} height={18} /></div>;
  if (cols.length === 0) return null;
  if (list.length === 0)
    return <Empty title={empty ?? 'Nothing here yet.'} {...(emptyHint === undefined ? {} : { hint: emptyHint })} {...(emptyIcon === undefined ? {} : { icon: emptyIcon })} />;

  // Every fraction gets a floor: bare `2fr` is `minmax(auto, 2fr)`, so once the
  // fixed columns exceed the container it collapses toward zero and its text
  // paints OVER the next cell.
  const template = [selectable ? '26px' : '', ...cols.map((c) => (c.px !== undefined ? `${c.px}px` : c.w === 'auto' ? 'auto' : `minmax(150px, ${c.w ?? 1}fr)`))].filter((t) => t !== '').join(' ');
  const minWidth = cols.reduce((total, c) => total + (c.px ?? 150) + 14, selectable ? 40 : 0);

  const groupAt = new Map<number, string>();
  if (groupKey !== undefined) {
    let last: string | null = null;
    list.forEach((row, i) => {
      const value = str(row, groupKey);
      if (value !== last) groupAt.set(i, value);
      last = value;
    });
  }

  const allSelected = selectable && list.length > 0 && list.every((row) => selected.has(str(row, key)));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      {/* The floor is a DESKTOP floor. On a phone the rows collapse to a
        * two-line list (see the media query), and forcing a minimum there made
        * the whole table scroll sideways — which is the desktop layout wearing
        * a phone, exactly the thing being fixed. CSS drops it below the
        * breakpoint. */}
      <div className="ly-rows__grid" style={{ minWidth }}>
      {/* A table head, not a row of tiny grey capitals.
       *
       * Uppercase at 11px with wide tracking is harder to read than the data
       * under it and dates the whole screen; sentence case at the body size,
       * one step down in colour, reads as a label without shouting. The rule
       * belongs to the head — so the first row does not draw its own and end
       * up doubling it. */}
      {headers === false ? null : (
        <div
          className="ly-rows__head"
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            gap: 14,
            padding: '10px 16px',
            alignItems: 'center',
            background: 'var(--surface-sunk)',
            borderBottom: '1px solid var(--line)',
          }}
        >
          {!selectable ? null : (
            <Check
              label={allSelected ? 'Clear selection' : 'Select all'}
              checked={allSelected}
              novaRef={selectRef}
              payload={{ all: true }}
            />
          )}
          {cols.map((c, i) => {
            const sortable = c.sortable !== undefined && onSortRef !== undefined;
            const live = sortable && sortKey === c.sortable;
            const label = (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: 11,
                  fontWeight: WEIGHT['semi'],
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: live ? COLOR['soft'] : COLOR['faint'],
                }}
              >
                {c.label}
                {!live ? null : <Icon name={sortDir === 'desc' ? 'arrowDown' : 'arrowUp'} size={12} />}
              </span>
            );
            if (!sortable) {
              return (
                <span key={i} style={{ textAlign: c.align ?? 'left' }}>
                  {label}
                </span>
              );
            }
            return (
              <button
                key={i}
                type="button"
                aria-sort={live ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                onClick={() => dispatch({ type: 'ui:click', ref: onSortRef, payload: { key: c.sortable, dir: live && sortDir !== 'desc' ? 'desc' : 'asc' } })}
                style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', textAlign: c.align ?? 'left', justifySelf: c.align === 'right' ? 'end' : 'start' }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {list.map((row, rowIndex) => (
        <Fragment key={str(row, key) || rowIndex}>
        {groupAt.get(rowIndex) === undefined ? null : (
          <div
            className="ly-rows__group"
            style={{
              padding: '9px 16px 6px',
              fontSize: SIZE['xs'],
              fontWeight: WEIGHT['semi'],
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: COLOR['mute'],
              background: 'var(--surface-sunk)',
              borderTop: rowIndex === 0 ? undefined : '1px solid var(--line)',
            }}
          >
            {groupAt.get(rowIndex)}
          </div>
        )}
        <div
          className={cx('ly-row-item', onRowRef !== undefined && 'ly-row-item--clickable')}
          style={{
            display: 'grid',
            gridTemplateColumns: template,
            gap: 14,
            padding: '11px 16px',
            alignItems: 'center',
            ...(selected.has(str(row, key)) ? { background: 'var(--accent-soft)' } : {}),
            ...((rowIndex === 0 && headers !== false) || groupAt.get(rowIndex) !== undefined ? {} : { borderTop: '1px solid var(--line)' }),
          }}
          {...(onRowRef === undefined
            ? {}
            : {
                role: 'button',
                tabIndex: 0,
                onClick: () => dispatch({ type: 'ui:click', ref: onRowRef, payload: row }),
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    dispatch({ type: 'ui:click', ref: onRowRef, payload: row });
                  }
                },
              })}
        >
          {!selectable ? null : (
            <Check label={`Select ${str(row, key)}`} checked={selected.has(str(row, key))} novaRef={selectRef} payload={row} />
          )}
          {cols.map((c, i) => (
            <div
              key={i}
              className={cx('ly-row-cell', (c.cell.kind === 'action' || c.cell.kind === 'menu') && 'ly-row-cell--action')}
              style={{ minWidth: 0, textAlign: c.align ?? 'left' }}
            >
              {renderCell(c.cell, row, dispatch)}
            </div>
          ))}
        </div>
        </Fragment>
      ))}
      </div>
    </div>
  );
};

// ── THE OVERFLOW MENU ────────────────────────────────────────
const RowMenu = ({ items, row, dispatch }: { items: MenuItem[]; row: Row; dispatch: ReturnType<typeof useNovaDispatch> }): React.ReactElement | null => {
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const shown = items.filter((item) => {
    if (item.showKey !== undefined && row[item.showKey] !== true) return false;
    if (item.hideKey !== undefined && row[item.hideKey] === true) return false;
    return true;
  });
  if (shown.length === 0) return null;
  const open = at !== null;
  return (
    <span style={{ display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
          setAt(open ? null : { top: box.bottom + 4, right: window.innerWidth - box.right });
        }}
        onBlur={() => setTimeout(() => setAt(null), 140)}
        style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, border: 0, borderRadius: 'var(--radius-sm)', background: 'none', cursor: 'pointer', color: 'var(--ink-mute)' }}
      >
        <Icon name="more" size={17} />
      </button>
      {at === null
        ? null
        : createPortal(
        <div
          role="menu"
          style={{
            position: 'fixed',
            zIndex: 60,
            top: at.top,
            right: at.right,
            minWidth: 168,
            padding: 4,
            background: 'var(--surface)',
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {shown.map((item, i) => (
            <button
              key={i}
              type="button"
              role="menuitem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                e.stopPropagation();
                setAt(null);
                dispatch({ type: 'ui:click', ref: item.ref, payload: row });
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                width: '100%',
                padding: '7px 10px',
                border: 0,
                borderRadius: 4,
                background: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: SIZE['sm'],
                color: item.danger === true ? 'var(--alert)' : 'var(--ink)',
              }}
            >
              {item.icon === undefined ? null : <Icon name={item.icon} size={15} />}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
};

const renderCell = (cell: z.infer<typeof CellSchema>, row: Row, dispatch: ReturnType<typeof useNovaDispatch>): React.ReactNode => {
  switch (cell.kind) {
    case 'bands': {
      const value = row[cell.key];
      return <Bands bands={Array.isArray(value) ? (value as string[]) : []} w={96} h={12} />;
    }
    case 'icon': {
      const name = cell.icon ?? str(row, cell.key);
      const hue = cell.hueKey === undefined ? undefined : str(row, cell.hueKey);
      return <Icon name={name} size={17} {...(hue !== undefined && hue !== '' ? { hue: hue as never } : { color: 'mute' as const })} />;
    }
    case 'meter': {
      const value = Number(row[cell.key] ?? 0);
      const max = Number(row[cell.maxKey] ?? 0);
      return <Meter value={Number.isFinite(value) ? value : 0} max={Number.isFinite(max) ? max : 0} showValue {...(cell.captionKey === undefined ? {} : { caption: str(row, cell.captionKey) })} />;
    }
    case 'menu':
      return <RowMenu items={cell.items as MenuItem[]} row={row} dispatch={dispatch} />;
    case 'text':
      return (
        <span
          style={{
            fontSize: SIZE['md'],
            color: COLOR[cell.color ?? 'soft'],
            ...(cell.mono === true ? { fontFamily: 'var(--font-mono)', fontSize: SIZE['sm'] } : {}),
            display: 'block',
            ...(cell.wrap === true
              ? { lineHeight: 1.5, overflowWrap: 'anywhere' }
              : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
          }}
        >
          {str(row, cell.key)}
        </span>
      );
    case 'primary':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
          {cell.dotKey === undefined ? null : <Dot tone={toneOf(row, cell.dotKey)} />}
          {/* IT WRAPS. It does not truncate.
           *
           * Both lines were `nowrap` + ellipsis, which is right for a column of
           * names and wrong for the thing the row is FOR: "Mark the trial l…"
           * over "Ends the trial. This…" tells you nothing, and the answer is
           * never to make the column wider — there is always a longer sentence.
           *
           * The subtitle wraps too. It was clamped at two lines, which is the
           * same mistake one step quieter: a sentence cut at "so preview i…"
           * is not shorter, it is unreadable. If a subtitle is too long for a
           * row, the fix is a shorter subtitle. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ fontSize: SIZE['md'], fontWeight: WEIGHT['medium'], color: COLOR['ink'], minWidth: 0 }}>{str(row, cell.key)}</span>
            {/* A SUBTITLE THAT REPEATS ITS TITLE IS NOISE. The timetable had
                five of nine rows reading "Fundamentals" over "Fundamentals" —
                a class named after its own programme — and the same shape turns
                up wherever a row's name defaults to its type. Dropped here
                rather than in each spec, because every spec would have to
                remember, and the data decides it per ROW anyway. */}
            {cell.subKey === undefined || str(row, cell.subKey) === '' || str(row, cell.subKey) === str(row, cell.key) ? null : (
              <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'], minWidth: 0 }}>{str(row, cell.subKey)}</span>
            )}
          </div>
        </div>
      );
    case 'badge': {
      if (cell.showKey !== undefined && row[cell.showKey] !== true) return null;
      const hue = cell.hueKey === undefined ? '' : str(row, cell.hueKey);
      if (hue !== '') return <Badge hue={hue as never} label={str(row, cell.key)} />;
      return <Badge tone={toneOf(row, cell.toneKey)} label={str(row, cell.key)} />;
    }
    case 'avatar':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={str(row, cell.key)} size={32} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: SIZE['md'], fontWeight: WEIGHT['medium'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{str(row, cell.key)}</span>
            {cell.subKey === undefined ? null : <span style={{ fontSize: SIZE['sm'], color: COLOR['mute'], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{str(row, cell.subKey)}</span>}
          </div>
        </div>
      );
    case 'number':
      return (
        <span style={{ fontSize: SIZE['md'], color: COLOR['ink'], fontVariantNumeric: 'tabular-nums' }}>
          {str(row, cell.key)}
          {cell.suffix === undefined ? null : <span style={{ color: COLOR['mute'] }}> {cell.suffix}</span>}
        </span>
      );
    case 'action':
      if (cell.hideKey !== undefined && row[cell.hideKey] === true) return null;
      if (cell.showKey !== undefined && row[cell.showKey] !== true) return null;
      return (
        <button
          type="button"
          className={cx('ly-btn', `ly-btn--${cell.variant ?? 'outline'}`)}
          style={{ padding: '5px 11px', fontSize: SIZE['sm'] }}
          onClick={(e) => {
            e.stopPropagation();
            dispatch({ type: 'ui:click', ref: cell.ref, payload: row });
          }}
        >
          {cell.label}
        </button>
      );
  }
};

Rows.meta = { description: 'The DATA list: an object, its state, the verbs on it. Columns are a spec; a cell kind comes from a closed vocabulary. For menus use Links, for objects worth a paragraph use Cards.', propsSchema: RowsProps };
