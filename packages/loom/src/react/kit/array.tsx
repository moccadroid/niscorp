import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/react';
import { isRecord } from '@compile/parse';
import type { Pattern } from '@compile/types';
import { LOOM_COLUMN } from '@editor/default.layout';
import { useModelWrite } from '../hooks/model.js';
import { decodeLiteral, inputStyle, matches } from './shared.js';
import { ActionMenu, MenuItem, SubMenu } from './menu.js';

// The array container, its item cells, the editor's canvas column, and the
// list-mutating actions (append + the per-row menu).

const arrayStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px dashed #d1d5db', borderRadius: 6 };
const arrayItemStyle: CSSProperties = { display: 'flex', gap: 6, alignItems: 'flex-start' };
const itemEditorStyle: CSSProperties = { flex: 1, minWidth: 0 };
const addButtonStyle: CSSProperties = { ...inputStyle, alignSelf: 'flex-start', cursor: 'pointer', background: '#f3f4f6' };

// Holds the rendered items (the compiled loop) plus the add button.
export const LoomArray: NovaComponent = ({ children }) => <div style={arrayStyle}>{children}</div>;

// One item's row, laid out left-to-right: the editor cell (a `box`, which grows)
// then the actions menu. The compiler wraps the editor in the box, so this is a
// plain flex row — no splitting of children (Nova hands them as one tree).
export const LoomArrayItem: NovaComponent = ({ children }) => <div style={arrayItemStyle}>{children}</div>;

// A flexible cell that grows to fill its row — the array item's editor lives in one.
export const LoomBox: NovaComponent = ({ children }) => <div style={itemEditorStyle}>{children}</div>;

// A sized column for the editor's canvasLayout: grows to share the row but won't
// shrink below `min`, so columns don't squish. The one layout primitive no Nova
// builtin provides (Stack/Box can't size a child).
export const LoomColumn: NovaComponent<{ grow?: number; min?: number }> = ({ grow, min, children }) => {
  const style: CSSProperties = { flexGrow: grow ?? 1, flexShrink: 1, flexBasis: min ?? 320, minWidth: min ?? 320 };
  return <div style={style}>{children}</div>;
};

// Grows a recursive list: bound to the list as its model, it appends a default
// `child` and writes the new array back through `ui:model` — the same pipeline a
// control edit uses, so the resolved path is correct at any depth. This is how a
// node deeper in a tree gains a child without a static push target.
export const LoomAppend: NovaComponent<{ label?: string; value?: unknown; child?: unknown }> = ({
  label,
  value,
  child,
  novaModel,
}) => {
  const set = useModelWrite(novaModel);
  const onClick = (): void => {
    const current = Array.isArray(value) ? value : [];
    set([...current, decodeLiteral(child)]);
  };
  return (
    <button type="button" onClick={onClick} style={addButtonStyle}>
      {label ?? 'Add'}
    </button>
  );
};

// Move `from` to `to`, clamped — out-of-range (past either end) is a no-op.
const reorder = (list: readonly unknown[], from: number, to: number): unknown[] => {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

// A container variant the menu can wrap an element into, or recognize for
// unwrap. `key` holds the child-list. Mirror of the compiler's `Container`.
type RowContainer = { label: string; pattern: Pattern; defaults: unknown; key: string };

// The per-row actions menu. Bound to the loop's `$items` (the whole list), so
// `value` is the list and a write replaces it; `index` is this row. Move and
// remove always; wrap (into each container variant) and unwrap (when this row is
// a container) appear only when `containers` is non-empty. All are array writes.
export const LoomRowMenu: NovaComponent<{
  index?: unknown;
  containers?: unknown;
  value?: unknown;
}> = ({ index, containers, value, novaModel }) => {
  const set = useModelWrite(novaModel);
  const i = Number(index);
  const list = Array.isArray(value) ? value : undefined;
  if (list === undefined || !Number.isInteger(i)) return null;

  const element = list[i];
  const targets = decodeLiteral<RowContainer[]>(containers) ?? [];
  const unwrapTarget = targets.find((container) => matches(element, container.pattern));
  const wrapInto = (container: RowContainer): unknown[] => [
    ...list.slice(0, i),
    { ...(isRecord(container.defaults) ? container.defaults : {}), [container.key]: [element] },
    ...list.slice(i + 1),
  ];

  return (
    <ActionMenu>
      <MenuItem label="↑ Move up" onSelect={() => set(reorder(list, i, i - 1))} disabled={i === 0} />
      <MenuItem label="↓ Move down" onSelect={() => set(reorder(list, i, i + 1))} disabled={i === list.length - 1} />
      {targets.length > 0 ? (
        <SubMenu label="⧉ Wrap in">
          {targets.map((container, k) => (
            <MenuItem key={k} label={container.label} onSelect={() => set(wrapInto(container))} />
          ))}
        </SubMenu>
      ) : null}
      {unwrapTarget !== undefined ? (
        <MenuItem
          label="⇲ Unwrap"
          onSelect={() => {
            const children = isRecord(element) && Array.isArray(element[unwrapTarget.key]) ? (element[unwrapTarget.key] as unknown[]) : [];
            set([...list.slice(0, i), ...children, ...list.slice(i + 1)]);
          }}
        />
      ) : null}
      <MenuItem label="✕ Remove" onSelect={() => set(list.filter((_, j) => j !== i))} />
    </ActionMenu>
  );
};

export { LOOM_COLUMN };
