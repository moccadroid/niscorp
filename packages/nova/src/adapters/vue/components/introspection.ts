import { defineComponent, h, type VNode } from 'vue';
import { JsonTreePropsSchema, PanelPropsSchema, type JsonTreeProps, type PanelProps } from '../../primitive-props';
import { useNovaDispatch } from '../composables/context';

// ═══════════════════════════════════════════════════════════
// The introspection primitives nova/devtools composes against — Panel and
// JsonTree. Generic, useful anywhere.
// ═══════════════════════════════════════════════════════════

export { PanelPropsSchema, type PanelProps, JsonTreePropsSchema, type JsonTreeProps };

// ─── Panel ─────────────────────────────────────────────────
// A framed, elevated surface with an optional title header. `backRef` /
// `closeRef` grow a header ← / ✕ firing ui:click with that ref.

const HEADER_BUTTON_STYLE = {
  border: 'none',
  background: 'none',
  color: '#6b7280',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: 1,
  padding: '2px',
};

export const Panel = Object.assign(
  defineComponent(
    (props: PanelProps, { slots }) => {
      const dispatch = useNovaDispatch();
      const headerButton = (ref: string, glyph: string): VNode =>
        h('button', { type: 'button', style: HEADER_BUTTON_STYLE, onClick: () => dispatch({ type: 'ui:click', ref }) }, glyph);
      return () =>
        h(
          'div',
          {
            style: {
              border: '1px solid #d8dae0',
              borderRadius: '10px',
              background: '#fff',
              boxShadow: '0 1px 3px rgba(0,0,0,.06)',
              padding: '12px',
            },
          },
          [
            props.title === undefined
              ? null
              : h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', marginBottom: '8px' } }, [
                  props.backRef === undefined ? null : headerButton(props.backRef, '←'),
                  h('span', { style: { flex: 1 } }, props.title),
                  props.closeRef === undefined ? null : headerButton(props.closeRef, '✕'),
                ]),
            slots.default?.(),
          ],
        );
    },
    { name: 'NovaPanel', props: ['title', 'backRef', 'closeRef'], inheritAttrs: false },
  ),
  {
    meta: {
      description: 'A framed, elevated surface with an optional title; `closeRef` adds a header ✕.',
      propsSchema: PanelPropsSchema,
    },
  },
);

// ─── JsonTree ──────────────────────────────────────────────
// A collapsible view of any JSON value via native <details> (no state).

const entriesOf = (value: object): Array<[string, unknown]> =>
  Array.isArray(value) ? value.map((item, index): [string, unknown] => [String(index), item]) : Object.entries(value);

const jsonNode = (value: unknown, name: string | undefined, key?: string): VNode => {
  if (value !== null && typeof value === 'object') {
    const entries = entriesOf(value);
    const shape = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    return h('details', { key }, [
      h('summary', { style: { cursor: 'pointer', color: '#6b7280' } }, name === undefined ? shape : `${name} ${shape}`),
      h(
        'div',
        { style: { paddingLeft: '13px', borderLeft: '1px solid #d8dae0', marginLeft: '3px' } },
        entries.map(([childKey, child]) => jsonNode(child, childKey, childKey)),
      ),
    ]);
  }
  const text = name === undefined ? JSON.stringify(value) : `${name}: ${JSON.stringify(value)}`;
  return h('div', { key, style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, text);
};

export const JsonTree = Object.assign(
  defineComponent(
    (props: JsonTreeProps) => () =>
      h(
        'div',
        { style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: 1.5 } },
        [jsonNode(props.value, props.label)],
      ),
    { name: 'NovaJsonTree', props: ['value', 'label'], inheritAttrs: false },
  ),
  { meta: { description: 'A collapsible view of any JSON value.', propsSchema: JsonTreePropsSchema } },
);
