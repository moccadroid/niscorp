import type { FC } from 'react';
import { z } from 'zod';
import type { NovaComponent, NovaComponentProps } from '@react';

// ═══════════════════════════════════════════════════════════
// JsonTree — a collapsible view of any JSON value, via native <details> (no
// state). The value arrives already resolved in props. Used by nova/devtools
// to show data / endpoint configs / audit detail; useful anywhere.
// ═══════════════════════════════════════════════════════════

const entriesOf = (value: object): Array<[string, unknown]> =>
  Array.isArray(value) ? value.map((item, index): [string, unknown] => [String(index), item]) : Object.entries(value);

const JsonNode: FC<{ value: unknown; name?: string }> = ({ value, name }) => {
  if (value !== null && typeof value === 'object') {
    const entries = entriesOf(value);
    const shape = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    return (
      <details>
        <summary style={{ cursor: 'pointer', color: '#6b7280' }}>{name === undefined ? shape : `${name} ${shape}`}</summary>
        <div style={{ paddingLeft: 13, borderLeft: '1px solid #d8dae0', marginLeft: 3 }}>
          {entries.map(([key, child]) => (
            <JsonNode key={key} value={child} name={key} />
          ))}
        </div>
      </details>
    );
  }
  const text = name === undefined ? JSON.stringify(value) : `${name}: ${JSON.stringify(value)}`;
  return <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</div>;
};

export const JsonTreePropsSchema = z
  .object({
    value: z.unknown().optional().describe('The value to render.'),
    label: z.string().optional().describe('A name for the root node.'),
  })
  .strict()
  .describe('A collapsible view of any JSON value.');

export type JsonTreeProps = z.infer<typeof JsonTreePropsSchema>;

export const JsonTree: NovaComponent<JsonTreeProps> = ({ value, label }: NovaComponentProps & JsonTreeProps) => (
  <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, lineHeight: 1.5 }}>
    <JsonNode value={value} name={label} />
  </div>
);

JsonTree.meta = { description: 'A collapsible view of any JSON value.', propsSchema: JsonTreePropsSchema };
