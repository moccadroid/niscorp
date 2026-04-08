import type { CSSProperties, FC } from 'react';
import { useRuntimeView } from '../runtime-context';

const LEGEND_STYLE: CSSProperties = {
  padding: '12px 16px',
  background: '#f3f4f6',
  color: '#4b5563',
  fontSize: 11,
  borderBottom: '1px solid #e5e7eb',
  fontStyle: 'italic',
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isSingleTextChild = (children: unknown): { value: string } | undefined => {
  if (!Array.isArray(children)) return undefined;
  if (children.length !== 1) return undefined;
  const only = children[0];
  if (!isPlainObject(only)) return undefined;
  if (only.type !== 'text') return undefined;
  if (typeof only.value !== 'string') return undefined;
  return { value: only.value };
};

const collapseTextChildren = (node: unknown): unknown => {
  if (Array.isArray(node)) {
    return node.map((item) => collapseTextChildren(item));
  }
  if (!isPlainObject(node)) return node;
  const result: Record<string, unknown> = {};
  const isComponent = node.type === 'component';
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (isComponent && key === 'children') {
      const collapsed = isSingleTextChild(value);
      if (collapsed !== undefined) {
        result[key] = collapsed.value;
        continue;
      }
    }
    result[key] = collapseTextChildren(value);
  }
  return result;
};

export const RenderTab: FC = () => {
  const view = useRuntimeView();
  const tree = view?.renderTree ?? [];
  const collapsed = collapseTextChildren(tree);
  return (
    <div>
      <div style={LEGEND_STYLE}>
        The resolved RenderNode tree the renderer emits. Templates are interpolated; bindings are
        evaluated; string children become text nodes.
      </div>
      <pre
        style={{
          margin: 0,
          padding: 16,
          fontSize: 11,
          fontFamily: 'ui-monospace, Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {JSON.stringify(collapsed, null, 2)}
      </pre>
    </div>
  );
};
