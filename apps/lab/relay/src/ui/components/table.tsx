import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react';
import { z } from 'zod';
import { useNovaDispatch, type NovaComponent } from '@niscorp/nova/adapters/react';
import { cx } from '../lib/cx';
import { Text, Badge, Avatar, Icon } from './display';
import { Button, SortHeader, MenuItem } from './controls';
import { Popover } from './layout';
import { Skeleton } from './feedback';

// The `{field}` tokens in `sub` have single braces so nova's `{{…}}` resolver
// leaves them for the table to fill.
const CellSchema = z
  .object({
    kind: z.enum(['text', 'badge', 'avatarName', 'primary', 'check']),
    key: z.string().describe('Row field to display (dotted path ok). For `check`, the boolean field it reflects.'),
    ref: z.string().optional().describe('`check` only: the ui:click ref fired on toggle, carrying { id: row[rowKey], done: <new state> }.'),
    color: z.string().optional(),
    mono: z.boolean().optional(),
    weight: z.number().optional(),
    size: z.string().optional(),
    tone: z.string().optional(),
    toneMap: z.record(z.string(), z.string()).optional().describe('Map field value → tone; `_` is the fallback.'),
    dot: z.boolean().optional(),
    icon: z.string().optional(),
    sub: z.string().optional().describe('Secondary line; `{field}` tokens are filled from the row.'),
  })
  .strict();

const ColumnSchema = z
  .object({
    label: z.string(),
    sort: z.string().optional().describe('entity.field for Vex sortBy; omit to make the column unsortable.'),
    align: z.enum(['end']).optional(),
    w: z
      .union([z.number(), z.literal('auto')])
      .optional()
      .describe('Column width: a number is a flexible fraction (2 = twice as wide as 1); "auto" hugs content (a checkbox). Default 1.'),
    hideNarrow: z
      .boolean()
      .optional()
      .describe('Drop this column when the table is narrow (a quickview, a phone) — keep the identifying column visible.'),
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
    loading: z.boolean().optional(),
    empty: z.string().optional(),
    rowKey: z
      .string()
      .optional()
      .describe(
        'Field used as the row identity / selection match — MUST be unique per row (usually "id"). ' +
          'Also the click payload unless clickKey is set. Default "id".',
      ),
    clickKey: z
      .string()
      .optional()
      .describe(
        'Field carried as the row-click payload when it differs from the row identity — e.g. rowKey "id" ' +
          '(unique) with clickKey "deal_id" so clicking opens the related deal. Defaults to rowKey.',
      ),
    rowRef: z.string().optional().describe('ui:click ref fired on a row click, carrying row[clickKey ?? rowKey].'),
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
      // An unknown tone falls back to the base badge styling, so the cast is safe.
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
  loading,
  empty,
  rowKey = 'id',
  clickKey,
  rowRef,
  selectedId,
  sortBy,
  sortDir,
  sortRef,
  menu,
}: TableP) => {
  const dispatch = useNovaDispatch();
  // A generated or mis-bound layout can pass a non-array despite the type; it
  // renders empty and does not throw.
  const rowList = Array.isArray(rows) ? rows : [];
  const colList = Array.isArray(columns) ? columns : [];

  // Both templates are CSS custom properties so the @container rule in ui.css
  // can switch between them; an inline grid-template-columns would win over it.
  const track = (w: number | 'auto' | undefined): string => (w === 'auto' ? 'auto' : `${w ?? 1}fr`);
  const wide = [...colList.map((col) => track(col.w)), ...(menu !== undefined ? ['auto'] : [])].join(' ');
  const visible = colList.filter((col) => col.hideNarrow !== true);
  const firstFlex = visible.find((col) => col.w !== 'auto');
  const narrow = [
    ...visible.map((col) => (col === firstFlex ? 'minmax(0, 1fr)' : 'auto')),
    ...(menu !== undefined ? ['auto'] : []),
  ].join(' ');
  const gridVars = { '--rl-tbl-wide': wide, '--rl-tbl-narrow': narrow } as CSSProperties;
  const selectedRowEl = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    selectedRowEl.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId]);

  const warnedRowKey = useRef(false);
  const seenIds = new Set<string>();
  const reactKeyFor = (id: unknown, index: number): string => {
    const raw = txt(id);
    if (raw === '' || seenIds.has(raw)) {
      if (!warnedRowKey.current) {
        warnedRowKey.current = true;
        console.warn(`[relay:Table] rowKey "${rowKey}" is missing or duplicated on some rows — using the row index for those`);
      }
      return `row-${index}`;
    }
    seenIds.add(raw);
    return raw;
  };

  if (loading === true) {
    return (
      <div className="rl-tbl">
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
    <div className="rl-tbl" style={gridVars}>
      {/* Header */}
      <div className={cx('rl-tbl__grid', 'rl-tbl__head')}>
        {colList.map((col, i) => (
          <div
            key={i}
            className={cx('rl-tbl__hcell', col.align === 'end' && 'rl-tbl__hcell--end', col.hideNarrow === true && 'rl-tbl__hide')}
          >
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
      {rowList.length === 0 ? (
        <div className="rl-tbl__empty">{empty ?? 'Nothing here.'}</div>
      ) : (
        rowList.map((row, ri) => {
          const id = at(row, rowKey);
          const payload = clickKey !== undefined ? at(row, clickKey) : id;
          const selected = selectedId !== undefined && selectedId !== '' && id === selectedId;
          const open = menu !== undefined && menu.openId !== undefined && menu.openId !== '' && id === menu.openId;
          return (
            <div
              key={reactKeyFor(id, ri)}
              ref={selected ? selectedRowEl : undefined}
              className={cx('rl-tbl__grid', 'rl-tbl__row', 'rl-rowhover', selected && 'rl-rowselected')}
              onClick={rowRef !== undefined ? () => dispatch({ type: 'ui:click', ref: rowRef, payload }) : undefined}
            >
              {colList.map((col, ci) => (
                <div
                  key={ci}
                  className={cx('rl-tbl__cell', col.align === 'end' && 'rl-tbl__cell--end', col.hideNarrow === true && 'rl-tbl__hide')}
                >
                  {col.cell.kind === 'check' ? (
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
  events: {
    'ui:click': { description: 'on `rowRef` when a row is clicked, carrying row[clickKey ?? rowKey]; on `sortRef` when a header is clicked, carrying { sortBy, sortDir }' },
  },
};
