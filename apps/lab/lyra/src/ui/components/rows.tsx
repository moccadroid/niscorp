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

type MenuItem = { label: string; ref: string; icon?: string; danger?: boolean; showKey?: string; hideKey?: string };

// The kit's components declare only their AUTHORED props to JSX — `novaRef`
// and `checked` are injected by the nova adapter and deliberately absent from
// the schema. Rows renders a checkbox itself rather than through a layout, so
// it needs the wiring shape; this names it once instead of casting at four
// call sites.
const Check = Checkbox as unknown as (props: { label?: string; checked?: boolean; novaRef?: string; payload?: unknown }) => React.ReactElement | null;

// THE list. One component for every list in the application — members,
// classes, bookings, plans, attendance — because the alternative is a
// MemberRow, a ClassRow and a BookingRow, which is rule 2's exact failure mode.
//
// What differs between those lists is DATA: a column spec. What a cell renders
// is a `kind` from a closed vocabulary, and a cell reads its value from a key
// on the row. So adding a list is authoring a spec, and a theme replacing this
// list with cards is replacing a layout — neither is a new component.
//
// Everything here is presentational. Nothing formats: `due_display` arrives
// already a string, because formatting lives in a Prism transform upstream.

const CellSchema = z.discriminatedUnion('kind', [
  // `wrap` is the difference between a data point and a sentence. Without it
  // this cell is `nowrap` + ellipsis, which is right for a date and silently
  // destroys prose — the add-on store's "Adds a Belt panel on p…" was a
  // paragraph in a 150px track, unfixable by widening anything.
  z.object({ kind: z.literal('text'), key: z.string(), color: z.enum(['ink', 'soft', 'mute', 'faint']).optional(), mono: z.boolean().optional(), wrap: z.boolean().optional() }).strict(),
  z.object({ kind: z.literal('primary'), key: z.string(), subKey: z.string().optional(), dotKey: z.string().optional().describe('Row key holding a tone token — the stream marker') }).strict(),
  // A badge takes a TONE key (a state) or a HUE key (an identity). Both are
  // row keys because both are data; which one a list is allowed to carry is
  // settled where the row is authored and held by `design-check`.
  z.object({ kind: z.literal('badge'), key: z.string(), toneKey: z.string().optional(), hueKey: z.string().optional() }).strict(),
  // A color strip read off the row (`Bands` inline) — a rank, a flag. The
  // colors are content, like an avatar; an empty or missing array renders
  // nothing rather than an empty frame.
  z.object({ kind: z.literal('bands'), key: z.string() }).strict(),
  // An icon by name, from the row or fixed on the column. For the leading
  // glyph a list of kinds wants — a class type, a source, a channel.
  z.object({ kind: z.literal('icon'), key: z.string().optional(), icon: z.string().optional(), hueKey: z.string().optional() }).strict(),
  // A quantity against its limit, drawn. Replaces "12 of 20" in a coloured
  // badge — the reader stops doing the division.
  z.object({ kind: z.literal('meter'), key: z.string(), maxKey: z.string(), captionKey: z.string().optional() }).strict(),
  // THE OVERFLOW. Verbs were eating the table: the automations list spends
  // four of its eight columns on buttons, the timetable three of ten. One
  // column holds the rest, and a row on a phone stops being a button bar.
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
    // `w` is a flex weight (fr). `px` is a FIXED track, and it exists because
    // every row here is its own grid — a content-sized track therefore resolves
    // per row, so a status badge sat at a different x on every line depending
    // how long that row's date happened to be. Anything that must line up
    // vertically down the list gets a `px`.
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
    // GROUPING. A list that needs headings inside it had one option: several
    // Sections, each with its own read. `groupKey` names a row field and the
    // list breaks on it — confirmed vs waitlist, today vs tomorrow — which is
    // what a badge column was standing in for.
    groupKey: z.string().optional(),
    // SORT. Nothing in this app could be sorted, on a roll aimed at two
    // thousand people. The component owns which header is live and which way;
    // the ref carries `{ key, dir }` and the caller re-reads.
    sortKey: z.string().optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    onSortRef: z.string().optional(),
    // SELECTION. `selectedKeys` holds rowKey values; the ref fires with the
    // row and the next state. A list with no selection cannot express a bulk
    // act at all, which is why nothing in the product can message twelve
    // people at once.
    selectRef: z.string().optional(),
    selectedKeys: z.array(z.string()).optional(),
  })
  .strict();

type RowsP = Partial<z.infer<typeof RowsProps>>;
type Row = Record<string, unknown>;

const str = (row: Row, key: string | undefined): string => {
  if (key === undefined) return '';
  const v = row[key];
  return v === undefined || v === null ? '' : String(v);
};

// A tone arrives as a plain string on a row (a program's colour, a status).
// Narrowed by a predicate rather than asserted: an unknown value is ordinary —
// a new status somebody added to the database — and it should land on neutral,
// not lie about its type.
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
  // A list with no column spec is a layout that has not finished being
  // written — or, later, a themed layout that got it wrong. Either way it
  // renders as nothing rather than throwing, because the action's own default
  // layout is what a person should end up seeing.
  const cols = columns ?? [];
  const key = rowKey ?? 'id';

  const selected = new Set(selectedKeys ?? []);
  const selectable = selectRef !== undefined;

  if (loading === true) return <div style={{ padding: 16 }}><Skeleton lines={4} height={18} /></div>;
  if (cols.length === 0) return null;
  if (list.length === 0)
    return <Empty title={empty ?? 'Nothing here yet.'} {...(emptyHint === undefined ? {} : { hint: emptyHint })} {...(emptyIcon === undefined ? {} : { icon: emptyIcon })} />;

  // A FRACTION HAS A FLOOR, and a table that cannot fit SCROLLS.
  //
  // `2fr` alone means `minmax(auto, 2fr)` in a grid — and when the fixed columns
  // add up to more than the container, the fraction collapses toward zero and
  // its text spills OVER the next column. That is what "Fundamentals" printed
  // on top of "Monday" was: not a wrapping bug, a grid with no room left,
  // silently painting two cells in the same place.
  //
  // Adding a column is what caused it, which means any future column would
  // cause it again. So: every fraction gets a minimum, and the table scrolls
  // sideways rather than folding in on itself. A table you can push is a table
  // that survives a column being added to it.
  const template = [selectable ? '26px' : '', ...cols.map((c) => (c.px !== undefined ? `${c.px}px` : c.w === 'auto' ? 'auto' : `minmax(150px, ${c.w ?? 1}fr)`))].filter((t) => t !== '').join(' ');
  const minWidth = cols.reduce((total, c) => total + (c.px ?? 150) + 14, selectable ? 40 : 0);

  // GROUPS ARE A BREAK IN THE LIST, not a second read. The rows arrive in
  // whatever order the query returned; this only marks where the value of
  // `groupKey` changes, so a caller that wants groups sorts its own query —
  // which is the honest division of labour between a list and a read.
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
        // A HEADER THAT LOOKS LIKE ONE.
        //
        // It had no top padding, so it sat jammed against the top edge of the
        // card, and its horizontal padding was 16px against the rows' 16px but
        // WITHOUT the rows' 11px vertical — so it read as a stray line of grey
        // text rather than a header, and every column label sat a few pixels
        // off the value under it.
        //
        // Same grid, same padding as a row, plus the small-caps treatment that
        // says "this labels the column" instead of "this is the first row".
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
            // A SORTABLE HEADER IS A BUTTON. `sortable` on the column names
            // which key it sorts by, so the spec stays data and the component
            // owns the arrow and the aria — a list that cannot be sorted is a
            // roll of two thousand people in insertion order.
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
            // AN ACTION CELL IS MARKED, because the phone layout drops columns.
            //
            // Below the breakpoint a row becomes a two-line list item and every
            // display column past the third is hidden — right for a spreadsheet
            // column, wrong for a button. It meant an owner on a phone could not
            // retire a class or open a course roster: the controls were in the
            // DOM and `display: none`. A feature that disappears at 375px is a
            // feature that does not exist.
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
//
// Its own component because it holds open/closed state, which a `renderCell`
// switch cannot. Closes on the next click anywhere — a menu that needs its own
// dismissal affordance is a menu with two ways to be wrong.
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
          // MEASURED AND PORTALLED, not positioned relatively. A list scrolls
          // sideways (`overflow-x: auto` on the grid), and an overflow scroller
          // clips absolutely-positioned children — so the menu opened INSIDE
          // the table and was cut off at the row it belonged to. A portal
          // escapes the clip; fixed coordinates keep it on its button.
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
            // WRAP OR CLIP, and the caller says which. Clipping is right for a
            // date in a narrow track and destroys a sentence — see the cell
            // schema for the store row that made the case.
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
