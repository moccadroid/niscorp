import type { CSSProperties } from 'react';
import type { NovaComponent } from '@niscorp/nova/adapters/react';
import { isRecord } from '@compile/parse';
import type { Pattern } from '@compile/types';
import { LOOM_COLUMN } from '@editor/default.layout';
import { useModelWrite } from '../hooks/model.js';
import { decodeLiteral, inputStyle, matches } from './shared.js';
import { ActionMenu, MenuItem, SubMenu } from './menu.js';

const arrayStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8, padding: 12, border: '1px dashed #d1d5db', borderRadius: 6 };
const arrayItemStyle: CSSProperties = { display: 'flex', gap: 6, alignItems: 'flex-start' };
const itemEditorStyle: CSSProperties = { flex: 1, minWidth: 0 };
const addButtonStyle: CSSProperties = { ...inputStyle, alignSelf: 'flex-start', cursor: 'pointer', background: '#f3f4f6' };

export const LoomArray: NovaComponent = ({ children }) => <div style={arrayStyle}>{children}</div>;

export const LoomArrayItem: NovaComponent = ({ children }) => <div style={arrayItemStyle}>{children}</div>;

export const LoomBox: NovaComponent = ({ children }) => <div style={itemEditorStyle}>{children}</div>;

export const LoomColumn: NovaComponent<{ grow?: number; min?: number }> = ({ grow, min, children }) => {
  const style: CSSProperties = { flexGrow: grow ?? 1, flexShrink: 1, flexBasis: min ?? 320, minWidth: min ?? 320 };
  return <div style={style}>{children}</div>;
};

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

const reorder = (list: readonly unknown[], from: number, to: number): unknown[] => {
  if (to < 0 || to >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

type RowContainer = { label: string; pattern: Pattern; defaults: unknown; key: string };

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
