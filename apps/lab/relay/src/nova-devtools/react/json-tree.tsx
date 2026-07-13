import { z } from 'zod';
import type { NovaComponent } from '@niscorp/nova/react';
import { previewValue } from '../core/summarize';

// A tiny read-only JSON tree on native <details>/<summary> — registered as a
// Nova PRIMITIVE (layouts say `{ component: 'JsonTree', props: { value: '$.x' } }`).
// It exists as a component because arbitrary-depth recursion isn't expressible
// in the layout DSL — this is the Table situation, and it's the one piece a
// framework port genuinely reimplements.
const MAX_ITEMS = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const Leaf = ({ value }: { value: unknown }) => {
  const kind = value === null ? 'null' : typeof value;
  return <span className={`nd-json__leaf nd-json__leaf--${kind}`}>{typeof value === 'string' ? `"${value}"` : String(value)}</span>;
};

const Node = ({ label, value, depth }: { label: string; value: unknown; depth: number }) => {
  if (Array.isArray(value) || isRecord(value)) {
    const entries = Array.isArray(value)
      ? value.slice(0, MAX_ITEMS).map((v, i) => [String(i), v] as const)
      : Object.entries(value);
    const overflow = Array.isArray(value) && value.length > MAX_ITEMS ? value.length - MAX_ITEMS : 0;
    return (
      <details className="nd-json" open={depth < 1}>
        <summary>
          <span className="nd-json__key">{label}</span> <span className="nd-json__preview">{previewValue(value)}</span>
        </summary>
        <div className="nd-json__children">
          {entries.map(([key, child]) => (
            <Node key={key} label={key} value={child} depth={depth + 1} />
          ))}
          {overflow > 0 ? <div className="nd-json__more">… {overflow} more</div> : null}
        </div>
      </details>
    );
  }
  return (
    <div className="nd-json nd-json--leaf">
      <span className="nd-json__key">{label}</span> <Leaf value={value} />
    </div>
  );
};

const JsonTreeProps = z
  .object({
    value: z.unknown().optional().describe('The value to render as a collapsible tree.'),
    label: z.string().optional().describe('Root label (default "$").'),
  })
  .strict();

export const JsonTree: NovaComponent<z.infer<typeof JsonTreeProps>> = ({ value, label }) => (
  <Node label={label ?? '$'} value={value ?? null} depth={0} />
);

JsonTree.meta = {
  description: 'Read-only collapsible JSON tree (devtools primitive).',
  propsSchema: JsonTreeProps,
};
