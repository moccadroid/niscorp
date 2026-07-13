import { type ReactNode } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/react';
import { cx } from '../lib/cx';
import { Text, Badge } from './display';
import { Button, MenuItem } from './controls';
import { Popover } from './layout';
import { Skeleton } from './feedback';

// ─── Table ─────────────────────────────────────────────────
// A data-driven list table. Everything that varies between tables is declared
// in the layout as DATA: the `columns` (each a label and a cell spec), the
// grid `cols` class, and the optional row `⋯` menu. The component is a pure
// interpreter — it renders the scaffold (header + rows + skeleton + empty)
// from existing primitives and dispatches `ui:click` for the same refs an
// action's triggers already handle. All data shaping/formatting stays in
// Vex/Prism: cells display `row[key]` verbatim (the date is already "Jun 8").

const CellSchema = z
  .object({
    kind: z.enum(['text', 'badge', 'primary', 'check']),
    key: z.string().describe('Row field to display. For `check`, the boolean field it reflects.'),
    ref: z.string().optional().describe('`check` only: the ui:click ref fired on toggle, carrying { id: row[rowKey], done: <new state> }.'),
    // text
    color: z.string().optional(),
    redIf: z.string().optional().describe('`text` only: a row field; when truthy the cell renders red (e.g. an overdue flag).'),
    // badge
    toneMap: z.record(z.string(), z.string()).optional().describe('Map field value → badge tone; `_` is the fallback.'),
    // primary
    sub: z.string().optional().describe('Secondary line; `{field}` tokens are filled from the row.'),
  })
  .strict();

const ColumnSchema = z
  .object({
    label: z.string(),
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
    cols: z.string().describe('The grid class (e.g. "fb-cols-todos") — its column count must match columns (+1 if a menu).'),
    loading: z.boolean().optional(),
    empty: z.string().optional(),
    rowKey: z.string().optional().describe('Field used as the row identity / check payload. Default "id".'),
    menu: MenuSchema.optional(),
  })
  .strict();

type Cell = z.infer<typeof CellSchema>;
type TableP = z.infer<typeof TableProps>;

const txt = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

const at = (row: unknown, key: string): unknown =>
  row !== null && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined;

const interp = (tpl: string, row: unknown): string => tpl.replace(/\{([\w.]+)\}/g, (_m, k: string) => txt(at(row, k)));

const renderCell = (cell: Cell, row: unknown): ReactNode => {
  const v = at(row, cell.key);
  switch (cell.kind) {
    case 'badge': {
      const tone = cell.toneMap?.[String(v)] ?? cell.toneMap?.['_'] ?? 'slate';
      return <Badge tone={tone}>{txt(v)}</Badge>;
    }
    case 'primary':
      return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          <Text weight={500}>{txt(v)}</Text>
          {cell.sub !== undefined && interp(cell.sub, row) !== '' && (
            <Text size="xs" color="mute" truncate>
              {interp(cell.sub, row)}
            </Text>
          )}
        </span>
      );
    case 'text':
    default: {
      const red = cell.redIf !== undefined && at(row, cell.redIf) === true;
      return <Text color={red ? 'red' : (cell.color ?? 'default')}>{txt(v)}</Text>;
    }
  }
};

export const Table: NovaComponent<TableP> = ({
  rows = [],
  columns,
  cols,
  loading,
  empty,
  rowKey = 'id',
  menu,
}: TableP) => {
  const dispatch = useNovaDispatch();

  if (loading === true) {
    return (
      <div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="fb-tbl__skel">
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
      <div className={cx(cols, 'fb-tbl__head')}>
        {columns.map((col, i) => (
          <div key={i} className={cx('fb-tbl__hcell', col.align === 'end' && 'fb-tbl__hcell--end')}>
            {col.label}
          </div>
        ))}
        {menu !== undefined && <div className="fb-tbl__hcell" />}
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="fb-tbl__empty">{empty ?? 'Nothing here.'}</div>
      ) : (
        rows.map((row, ri) => {
          const id = at(row, rowKey);
          const open = menu !== undefined && menu.openId !== undefined && menu.openId !== '' && id === menu.openId;
          return (
            <div key={txt(id) !== '' ? txt(id) : String(ri)} className={cx(cols, 'fb-tbl__row', 'fb-rowhover')}>
              {columns.map((col, ci) => (
                <div key={ci} className={cx('fb-tbl__cell', col.align === 'end' && 'fb-tbl__cell--end')}>
                  {col.cell.kind === 'check' ? (
                    // Inline toggle: fires the cell's ref with the row id + the
                    // NEW state. The action persists it via its endpoint.
                    <input
                      type="checkbox"
                      className="fb-tbl__check"
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
                <div className="fb-tbl__menu">
                  {open ? (
                    <Popover closeRef={menu.closeRef}>
                      {kebab(id)}
                      <div className="fb-menu fb-rowmenu">
                        {menu.items.map((it) => (
                          // Item clicks carry the WHOLE row — so the action's
                          // row-edit/row-delete can seed an edit form or a
                          // confirm label straight from the row, no second read.
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
  description: 'Data-driven list table: a `columns` spec (label + cell) over `rows`, with optional row ⋯ menu, skeleton + empty. Cells show row fields verbatim (shape in Vex/Prism).',
  propsSchema: TableProps,
};
