import type { LayoutNode } from '@niscorp/nova';
import { isRecord } from '@compile/parse';

// The data document's editing layout — the nova plugin builds it from the data's
// own keys (the freeform key→value map the layout binds to). One field per key,
// each control bound to `$.<key>`, a writable path (the bare root `$` is not). A
// string value edits as a text input; anything else as a JSON editor.
const fieldFor = (key: string, value: unknown): LayoutNode => ({
  component: 'loom:field',
  props: { label: key },
  children: [{ component: typeof value === 'string' ? 'loom:text' : 'loom:raw', model: `$.${key}` }],
});

export const dataLayout = (value: unknown): LayoutNode => {
  const data = isRecord(value) ? value : {};
  return {
    component: 'Stack',
    props: { direction: 'column', gap: 12 },
    children: Object.keys(data).map((key) => fieldFor(key, data[key])),
  };
};
