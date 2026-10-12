import type { LayoutNode } from '@niscorp/nova';
import { isRecord } from '@compile/parse';

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
