import { type ReactNode, useEffect, useRef } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';
import { cx } from '../lib/cx';
import { Text, Badge, Avatar, Icon } from './display';
import { Button, SortHeader, MenuItem } from './controls';
import { Popover } from './layout';
import { Skeleton } from './feedback';

// ─── Table ─────────────────────────────────────────────────
// A data-driven list table. Everything that varies between tables is declared in
// the layout as DATA: the `columns` (each a label, an optional sort field, and a
// cell spec), the responsive grid `cols` class, the sort/selection bindings, and
// the optional row `⋯` menu. The component is a pure interpreter — it renders the
// scaffold (header + rows + skeleton + empty) from existing primitives and
// dispatches `ui:click` for the same refs an action's triggers already handle.
// All data shaping/formatting stays in Vex/Prism: cells display `row[key]`
// verbatim (the value is already "$1.8M", the date already "Apr 6, 2026").
//
// Cell value access is by field key (dotted paths ok, e.g. "company.name"); a
// `primary` cell's `sub` interpolates `{field}` tokens from the row (single
// braces, so Nova's own `{{…}}` resolver leaves them for us).

const CellSchema = z
  .object({
    kind: z.enum(['text', 'badge', 'avatarName', 'primary', 'check']),
    key: z.string().describe('Row field to display (dotted path ok). For `check`, the boolean field it reflects.'),
    ref: z.string().optional().describe('`check` only: the ui:click ref fired on toggle, carrying { id: row[rowKey], done: <new state> }.'),
    // text
    color: z.string().optional(),
    mono: z.boolean().optional(),
    weight: z.number().optional(),
    size: z.string().optional(),
    // badge
    tone: z.string().optional(),
    toneMap: z.record(z.string(), z.string()).optional().describe('Map field value → tone; `_` is the fallback.'),
    dot: z.boolean().optional(),
    // primary
    icon: z.string().optional(),
    sub: z.string().optional().describe('Secondary line; `{field}` tokens are filled from the row.'),
  })
  .strict();

const ColumnSchema = z
  .object({
    label: z.string(),
    sort: z.string().optional().describe('entity.field for Vex sortBy; omit to make the column unsortable.'),
    align: z.enum(['end']).optional(),
    cell: CellSchema,
  })
  .strict();

const MenuSchema = z
  .object({
    openId: z.unknown().optional().describe('The row id whose menu is open (bind to data).'),
    openRef: z.string(),
    closeRef: z.string(),
    items: z.array(z.object({ ref: z.string(), icon: z.string().optional(), label: z.string(), danger: z.boolean().optional() }).strict()),
  })
  .strict();

const TableProps = z
  .object({
    rows: z.array(z.unknown()).optional(),
    columns: z.array(ColumnSchema),
    cols: z.string().describe('The responsive grid class (e.g. "rl-cols-deals") — its column count must match columns (+1 if a menu).'),
    loading: z.boolean().optional(),
    empty: z.string().optional(),
    rowKey: z.string().optional().describe('Field used as the row identity / click payload / selection match. Default "id".'),
    rowRef: z.string().optional().describe('ui:click ref fired on a row click, carrying row[rowKey].'),
    selectedId: z.unknown().optional().describe('The row id currently open in a detail panel (bind to data).'),
    sortBy: z.string().optional(),
    sortDir: z.string().optional(),
    sortRef: z.string().optional().describe('ui:click ref fired by a header, carrying { sortBy, sortDir }.'),
    menu: MenuSchema.optional(),
  })
  .strict();

type Cell = z.infer<typeof CellSchema>;
type TableP = z.infer<typeof TableProps>;

type BadgeTone = 'slate' | 'accent' | 'green' | 'amber' | 'red' | 'blue' | 'pink';

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const at = (row: unknown, key: string): unknown => {
  let cur: unknown = row;
  for (const seg of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
};

const interp = (tpl: string, row: unknown): string => tpl.replace(/\{([\w.]+)\}/g, (_m, k: string) => txt(at(row, k)));

const renderCell = (cell: Cell, row: unknown): ReactNode => {
  const v = at(row, cell.key);
  switch (cell.kind) {
    case 'badge': {
      // Tone comes from data (a literal or a value→tone map); an unknown tone
      // just falls back to the base badge styling, so the cast is safe.
      const tone = (cell.tone ?? cell.toneMap?.[String(v)] ?? cell.toneMap?.['_'] ?? 'slate') as BadgeTone;
      return (
        <Badge tone={tone} dot={cell.dot}>
          {txt(v)}
        </Badge>
      );
    }
    case 'avatarName':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <Avatar name={txt(v)} size="sm" />
          <Text weight={500}>{txt(v)}</Text>
        </span>
      );
    case 'primary':
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {cell.icon !== undefined && <Icon name={cell.icon} size={15} />}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
            <Text weight={500}>{txt(v)}</Text>
            {cell.sub !== undefined && (
              <Text size="xs" color="mute">
                {interp(cell.sub, row)}
              </Text>
            )}
          </span>
        </span>
      );
    case 'text':
    default:
      return (
        <Text size={cell.size} weight={cell.weight} color={cell.color} mono={cell.mono}>
          {txt(v)}
        </Text>
      );
  }
};

export const Table: NovaComponent<TableP> = ({
  rows = [],
  columns,
  cols,
  loading,
  empty,
  rowKey = 'id',
  rowRef,
  selectedId,
  sortBy,
  sortDir,
  sortRef,
  menu,
}: TableP) => {
  const dispatch = useNovaDispatch();
  // Scroll the selected row into view when the selection changes — so opening a
  // record (a cross-link, or a freshly created/edited one) brings its row on
  // screen. `nearest` is a no-op when it's already visible.
  const selectedRowEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedRowEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  if (loading === true) {
    return (
      <div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rl-tbl__skel">
            <Skeleton width="48%" />
          </div>
        ))}
      </div>
    );
  }

  const kebab = (id: unknown): ReactNode =>
    menu !== undefined ? <Button variant="ghost" size="sm" icon="more" value={id} novaRef={menu.openRef} /> : null;

  return (
    <div>
      {/* Header */}
      <div className={cx(cols, 'rl-tbl__head')}>
        {columns.map((col, i) => (
          <div key={i} className={cx('rl-tbl__hcell', col.align === 'end' && 'rl-tbl__hcell--end')}>
            {col.sort !== undefined ? (
              <SortHeader label={col.label} field={col.sort} sortBy={sortBy} sortDir={sortDir} novaRef={sortRef} />
            ) : (
              <span className="rl-th-sort" style={{ cursor: 'default' }}>
                <span>{col.label}</span>
              </span>
            )}
          </div>
        ))}
        {menu !== undefined && <div className="rl-tbl__hcell" />}
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="rl-tbl__empty">{empty ?? 'Nothing here.'}</div>
      ) : (
        rows.map((row, ri) => {
          const id = at(row, rowKey);
          const selected = selectedId !== undefined && selectedId !== '' && id === selectedId;
          const open = menu !== undefined && menu.openId !== undefined && menu.openId !== '' && id === menu.openId;
          return (
            <div
              key={txt(id) !== '' ? txt(id) : String(ri)}
              ref={selected ? selectedRowEl : undefined}
              className={cx(cols, 'rl-tbl__row', 'rl-rowhover', selected && 'rl-rowselected')}
              onClick={rowRef !== undefined ? () => dispatch({ type: 'ui:click', ref: rowRef, payload: id }) : undefined}
            >
              {columns.map((col, ci) => (
                <div key={ci} className={cx('rl-tbl__cell', col.align === 'end' && 'rl-tbl__cell--end')}>
                  {col.cell.kind === 'check' ? (
                    // Inline toggle: fires the cell's ref with the row id + the NEW
                    // state; stops the row click. The action persists via task.setDone.
                    <input
                      type="checkbox"
                      className="rl-tbl__check"
                      checked={at(row, col.cell.key) === true}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        col.cell.ref !== undefined &&
                        dispatch({ type: 'ui:click', ref: col.cell.ref, payload: { id, done: e.target.checked } })
                      }
                    />
                  ) : (
                    renderCell(col.cell, row)
                  )}
                </div>
              ))}
              {menu !== undefined && (
                <div className="rl-tbl__menu">
                  {open ? (
                    <Popover closeRef={menu.closeRef}>
                      {kebab(id)}
                      <div className="rl-menu rl-rowmenu">
                        {menu.items.map((it) => (
                          // Item clicks carry the WHOLE row (the kebab open/close
                          // above keeps the id) — so the action's row-edit/row-delete
                          // can seed an edit form or a confirm label straight from
                          // the row, no second read.
                          <MenuItem key={it.ref} icon={it.icon} danger={it.danger} value={row} novaRef={it.ref}>
                            {it.label}
                          </MenuItem>
                        ))}
                      </div>
                    </Popover>
                  ) : (
                    kebab(id)
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
};
Table.meta = {
  description: 'Data-driven list table: a `columns` spec (label + sort field + cell) over `rows`, with sort headers, optional row ⋯ menu, skeleton + empty. Cells show row fields verbatim (shape in Vex/Prism).',
  propsSchema: TableProps,
};
