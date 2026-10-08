import {
  defineComponent,
  h,
  inject,
  onUnmounted,
  provide,
  ref,
  type FunctionalComponent,
  type InjectionKey,
  type SetupContext,
  type VNode,
  type VNodeArrayChildren,
} from 'vue';
import { createComponentRegistry } from '@niscorp/nova';
import { useNovaDispatch } from '@niscorp/nova/adapters/vue';
import type { NovaComponent, NovaDispatch } from '@niscorp/nova/adapters/vue';
import type { Target } from '@niscorp/moss/terminal';
import { vueTarget } from '@niscorp/moss/terminal/vue';
import type { KitOf } from './kit.props';
import { ALIGNS, GAPS, INKS, LANGS, LEVELS, MARKS, PANES, SCALES, SIGILS, SIZES, SPLITS, oneOf, records } from './kit';
import {
  SIGIL_SHAPES,
  areaOf,
  codeLines,
  flowDelays,
  numbers,
  instantOf,
  narrowOf,
  qrOf,
  remaining,
  sheetStyle,
  templateOf,
  text,
  weight,
  pipelineColumns,
  pipelineOf,
} from './kit.shape';
import type { PipelineStep } from './kit.shape';

// ═══════════════════════════════════════════════════════════════
// THE POSTER KIT IN VUE — the React kit's twin (./react.kit.ts): the same
// grammar, the same class names and data attributes, the same stylesheet. Vue
// builds the elements, from the trees moss's Vue target hands it; its mount
// root says so (`data-v-app`) to anybody who inspects it.
//
// Like React, Vue's adapter leaves a node's `ref` and `model` to the kit: a
// `ref`'d element is a `ui:click` whose payload is its `value`, a `model`'d
// field a `ui:model` per keystroke and a `ui:key` per key.
// ═══════════════════════════════════════════════════════════════

type Props = Record<string, unknown>;

// The node's `ref`, and the ref its `model` binds — injected by nova's walker.
const refOf = (props: Props): string | undefined => text(props['novaRef']);
const modelOf = (props: Props): string | undefined => {
  const model = props['novaModel'];
  return typeof model === 'object' && model !== null ? text(Reflect.get(model, 'ref')) : undefined;
};

// A stateful kit component. It declares no props, so everything the walker
// hands it arrives as attrs — read at render, where they are always current.
const stateful = (
  setup: (props: Props, slots: SetupContext['slots']) => () => VNode,
): NovaComponent =>
  defineComponent((_props: Record<string, never>, context) => setup(context.attrs, context.slots), {
    inheritAttrs: false,
  });

// The names a Sheet's narrow arrangement shows; each Sheet provides its own,
// read when its cells draw.
const NarrowKey: InjectionKey<() => Set<string> | undefined> = Symbol('lyceum.narrow');
const useNarrow = (): Set<string> | undefined => inject(NarrowKey, undefined)?.();

const data = (key: string, value: string | undefined): Record<string, string> =>
  value === undefined ? {} : { [`data-${key}`]: value };

// What every element here carries: its area (and whether the narrow
// arrangement leaves it out), and, if it is `ref`'d, the press. `dispatch`
// and `narrow` are injected by the caller — during render for a functional
// component, in setup for a stateful one.
const placed = (
  props: Props,
  dispatch: NovaDispatch,
  narrow: Set<string> | undefined,
  style: Record<string, string> = {},
): Record<string, unknown> => {
  const area = areaOf(props['area']);
  const ref = refOf(props);
  const value = props['value'];
  return {
    style: area === undefined ? style : { ...style, gridArea: area },
    ...(area !== undefined && narrow !== undefined && !narrow.has(area)
      ? { 'data-narrow-hidden': '' }
      : {}),
    ...(ref === undefined
      ? {}
      : {
          'data-ref': ref,
          onClick: (event: Event) => {
            event.stopPropagation();
            dispatch(
              value === undefined
                ? { type: 'ui:click', ref }
                : { type: 'ui:click', ref, payload: value },
            );
          },
        }),
  };
};

// A functional kit component: props and the default slot in, one element out.
const functional = (
  render: (
    props: Props,
    children: VNodeArrayChildren,
    place: (style?: Record<string, string>) => Record<string, unknown>,
  ) => VNode,
): NovaComponent => {
  const component: FunctionalComponent<Props> = (
    props: Props,
    context: Omit<SetupContext, 'expose'>,
  ) => {
    const dispatch = useNovaDispatch();
    const narrow = useNarrow();
    return render(props, context.slots['default']?.() ?? [], (style) =>
      placed(props, dispatch, narrow, style),
    );
  };
  component.inheritAttrs = false;
  return component;
};

const Page = functional((_props, children) =>
  h('div', { class: 'page' }, [...children, h('span', { class: 'renderer' }, 'Vue')]),
);

// A Sheet provides its narrow set to its own cells, so it needs a setup.
const Sheet: NovaComponent = stateful((props, slots) => {
  const dispatch = useNovaDispatch();
  const outer = inject(NarrowKey, undefined);
  const sizeOf = (): 'fill' | 'auto' => oneOf(props['size'], ['fill', 'auto'] as const) ?? 'auto';
  provide(NarrowKey, () => narrowOf(props['narrow'], sizeOf())?.names);
  return () => {
    const size = sizeOf();
    const narrow = narrowOf(props['narrow'], size);
    return h(
      'div',
      {
        ...placed(
          props,
          dispatch,
          outer?.(),
          sheetStyle(templateOf(props['areas'], props['rows'], props['cols'], size), narrow, size),
        ),
        class: 'sheet',
        'data-size': size,
        ...data('scale', oneOf(props['scale'], SCALES)),
        ...(narrow === undefined ? {} : { 'data-narrow': '' }),
      },
      slots['default']?.(),
    );
  };
});

const Cell = functional((props, children, place) =>
  h(
    'div',
    {
      ...place(),
      class: 'cell',
      ...data('ink', oneOf(props['ink'], INKS)),
      ...data('mark', oneOf(props['mark'], MARKS)),
      ...data('align', oneOf(props['align'], ALIGNS)),
      ...data('pad', oneOf(props['pad'], ['none'] as const)),
      ...data('scroll', oneOf(props['scroll'], ['y', 'end'] as const)),
    },
    children,
  ),
);

const Label = functional((_props, children, place) =>
  h('span', { ...place(), class: 'label' }, children),
);

const Headline = functional((props, children, place) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  return h(
    level === 'display' ? 'h1' : 'h2',
    { ...place(), class: 'headline', 'data-level': level },
    children,
  );
});

const Text = functional((props, children, place) =>
  h(
    'p',
    { ...place(), class: 'text', ...data('tone', oneOf(props['tone'], ['muted'] as const)), ...data('size', oneOf(props['size'], SIZES)) },
    children,
  ),
);

// The reading grammar, as the DOM kit draws it (./kit.ts).
const Exhibit = functional((props, _children, place) =>
  h('figure', { ...place(), class: 'exhibit', ...data('lang', oneOf(props['lang'], LANGS)), ...data('tone', oneOf(props['tone'], PANES)), ...data('flag', oneOf(props['flag'], INKS)) }, [
    h('figcaption', text(props['label']) ?? ''),
    h(
      'pre',
      codeLines(text(props['text']) ?? '', oneOf(props['lang'], LANGS), numbers(props['marked'])).map((line, i) =>
        h('span', { key: i, ...(line.marked ? { 'data-marked': '' } : {}), innerHTML: line.html }),
      ),
    ),
  ]),
);

const Pair = functional((props, children, place) => h('div', { ...place(), class: 'pair', ...data('split', oneOf(props['split'], SPLITS)) }, children));

const Stack = functional((props, children, place) =>
  h('div', { ...place(), class: 'stack', ...data('gap', oneOf(props['gap'], GAPS)), ...data('scroll', oneOf(props['scroll'], ['y'] as const)) }, children),
);

const Stats = functional((props, _children, place) =>
  h(
    'div',
    { ...place(), class: 'stats' },
    records(props['items']).map((item, i) => h('div', { key: i, ...data('ink', oneOf(item['ink'], INKS)) }, [h('b', text(item['value']) ?? '—'), h('span', text(item['label']) ?? '')])),
  ),
);

// A line of steps and one detour under it, as in the DOM kit.
const Pipeline = functional((props, _children, place) => {
  const shape = pipelineOf(props);
  const off = (is: boolean): Record<string, string> => (is ? { 'data-off': '' } : {});
  const at = (column: string, row: number): { style: Record<string, string> } => ({ style: { gridColumn: column, gridRow: String(row) } });
  const step = (item: PipelineStep, key: string, placing: Record<string, unknown> = {}): VNode =>
    h('div', { key, ...placing, class: 'pipeline-step', ...data('ink', oneOf(item.ink, INKS)), ...off(item.off) }, [h('b', item.label), h('i', item.note), h('span', item.value)]);
  const link = (name: string, said: string, isOff: boolean, key: string, placing: Record<string, unknown> = {}): VNode => h('div', { key, ...placing, class: name, ...off(isOff) }, [h('span', said)]);
  const detour = shape.detour;
  return h('div', { ...place({ gridTemplateColumns: pipelineColumns(shape.steps.length) }), class: 'pipeline' }, [
    ...shape.steps.flatMap((item, index) => {
      const next = shape.links[index];
      return [step(item, `s${index}`, at(String(index * 2 + 1), 1)), ...(next === undefined ? [] : [link('pipeline-link', next.label, next.off, `l${index}`, at(String(index * 2 + 2), 1))])];
    }),
    ...(detour === undefined
      ? []
      : [
          link('pipeline-enter', detour.enter, detour.off, 'enter', at(String(detour.from * 2 + 1), 2)),
          link('pipeline-leave', detour.leave, !detour.back, 'leave', at(String(detour.to * 2 + 1), 2)),
          h('div', { key: 'detour', ...at(`${detour.from * 2 + 1} / ${detour.to * 2 + 2}`, 3), class: 'pipeline-detour', ...off(detour.off) }, [
            h('span', { class: 'pipeline-said' }, detour.label),
            h('div', { class: 'pipeline-inner' }, detour.steps.flatMap((item, index) => [...(index === 0 ? [] : [link('pipeline-link', '', item.off, `dl${index}`)]), step(item, `ds${index}`)])),
          ]),
        ]),
    ...(shape.legend.length === 0 ? [] : [h('div', { key: 'legend', ...at(`${(detour?.to ?? 0) * 2 + 3} / -1`, 3), class: 'pipeline-legend' }, shape.legend.map((item, index) => h('span', { key: index, ...data('ink', oneOf(item.ink, INKS)) }, item.label)))]),
  ]);
});

const Figure = functional((props, _children, place) =>
  h('div', { ...place(), class: 'figure' }, [
    h('span', { class: 'label' }, text(props['label']) ?? ''),
    h('span', { class: 'value' }, text(props['value']) ?? '—'),
  ]),
);

// Ticks on the viewer's clock, as in the DOM kit; zero stays zero.
const Countdown: NovaComponent = stateful((props) => {
  const dispatch = useNovaDispatch();
  const narrow = inject(NarrowKey, undefined);
  const now = ref(Date.now());
  const timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  onUnmounted(() => clearInterval(timer));
  return () => {
    const left = remaining(instantOf(text(props['to'])), now.value);
    if (!left.running) clearInterval(timer);
    return h(
      'div',
      {
        ...placed(props, dispatch, narrow?.()),
        class: 'figure countdown',
        ...(left.done ? { 'data-done': '' } : {}),
      },
      [
        h('span', { class: 'label' }, text(props['label']) ?? ''),
        h('span', { class: 'value' }, left.shown),
      ],
    );
  };
});

const Code = functional((props, _children, place) => {
  const marked = new Set(
    Array.isArray(props['marked'])
      ? props['marked'].filter((n): n is number => typeof n === 'number')
      : [],
  );
  return h(
    'div',
    { ...place(), class: 'code' },
    (text(props['text']) ?? '')
      .split('\n')
      .map((line, i) =>
        h(
          'span',
          { key: i, ...(marked.has(i + 1) ? { 'data-marked': '' } : {}) },
          line === '' ? ' ' : line,
        ),
      ),
  );
});

const sigil = (shape: unknown, large: boolean): VNode => {
  const known = oneOf(shape, SIGILS);
  return h('span', [
    h(
      'svg',
      {
        viewBox: '0 0 100 100',
        class: 'sigil',
        'aria-hidden': 'true',
        ...(large ? { 'data-size': 'large' } : {}),
      },
      (known === undefined ? [] : SIGIL_SHAPES[known]).map((part) => h(part.tag, part.attrs)),
    ),
  ]);
};

const Sigil = functional((props, _children, place) =>
  h('span', place(), [sigil(props['shape'], props['size'] === 'large')]),
);

const Qr = functional((props, _children, place) => {
  const value = text(props['value']) ?? '';
  if (value === '') return h('span', { ...place(), class: 'qr' });
  const qr = qrOf(value);
  return h('span', { ...place(), class: 'qr' }, [
    h(
      'svg',
      { viewBox: qr.viewBox, 'shape-rendering': 'crispEdges', role: 'img', 'aria-label': value },
      [h('rect', { width: '100%', height: '100%', class: 'qr-ground' }), h('path', { d: qr.d })],
    ),
  ]);
});

const Rows: NovaComponent = stateful((props) => {
  const dispatch = useNovaDispatch();
  const narrow = inject(NarrowKey, undefined);
  return () => {
    const columns = records(props['columns']);
    const rowRef = text(props['rowRef']);
    const clickKey = text(props['clickKey']) ?? text(props['rowKey']) ?? '';
    const selected = props['selected'];
    const cols = columns.map((column) => `${weight(column['w']) ?? 1}fr`).join(' ');
    const labelled = columns.some((column) => (text(column['label']) ?? '') !== '');
    const head = labelled
      ? [
          h(
            'div',
            { key: 'head', style: { '--cols': cols } },
            columns.map((column) => h('span', text(column['label']) ?? '')),
          ),
        ]
      : [];
    const body = records(props['rows']).map((record, index) => {
      const key = record[clickKey];
      return h(
        'div',
        {
          key: text(key) ?? index,
          style: { '--cols': cols },
          ...(selected !== undefined && selected !== null && key === selected
            ? { 'data-selected': '' }
            : {}),
          ...(rowRef === undefined
            ? {}
            : {
                'data-press': '',
                onClick: () => dispatch({ type: 'ui:click', ref: rowRef, payload: key }),
              }),
        },
        columns.map((column) => {
          const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
          const value = record[text(column['key']) ?? ''];
          if (kind === 'sigil')
            return value === null || value === undefined
              ? h('span', { 'data-kind': 'missing' }, text(column['missing']) ?? '')
              : h('span', [sigil(value, false)]);
          if (value === null || value === undefined || value === '')
            return h('span', { 'data-kind': 'missing' }, text(column['missing']) ?? '');
          return h('span', { 'data-kind': kind }, text(value) ?? '');
        }),
      );
    });
    const rows =
      body.length === 0
        ? [...head, h('div', { key: 'empty', class: 'empty' }, text(props['empty']) ?? '')]
        : [...head, ...body];
    return h(
      'div',
      {
        ...placed(props, dispatch, narrow?.()),
        class: 'rows',
        ...(labelled ? { 'data-head': '' } : {}),
      },
      rows,
    );
  };
});

const Bar = functional((props, _children, place) => {
  const segments = records(props['segments']).filter(
    (segment) => typeof segment['value'] === 'number' && segment['value'] > 0,
  );
  return h(
    'div',
    {
      ...place({
        gridTemplateColumns:
          segments.map((segment) => `${text(segment['value']) ?? '1'}fr`).join(' ') || '1fr',
      }),
      class: 'bar',
    },
    segments.map((segment) =>
      h('span', {
        ...data('ink', oneOf(segment['ink'], INKS)),
        ...data('mark', oneOf(segment['mark'], MARKS)),
      }),
    ),
  );
});

// The dots start where the wall clock says, once, when the Flow first draws —
// Vue keeps the elements across updates, so they never jump back.
const Flow: NovaComponent = stateful((props) => {
  const dispatch = useNovaDispatch();
  const narrow = inject(NarrowKey, undefined);
  const delays = flowDelays(Date.now());
  return () =>
    h('div', { ...placed(props, dispatch, narrow?.()), class: 'flow' }, [
      h('div', { class: 'flow-end' }, text(props['from']) ?? ''),
      h(
        'div',
        { class: 'flow-lanes' },
        records(props['lanes']).map((lane) =>
          h(
            'div',
            {
              class: 'flow-lane',
              'data-toward': oneOf(lane['toward'], ['to', 'from'] as const) ?? 'to',
              ...data('ink', oneOf(lane['ink'], INKS)),
            },
            [
              h('span', { class: 'label' }, text(lane['label']) ?? ''),
              h(
                'div',
                { class: 'flow-track' },
                delays.map((delay) =>
                  h('span', { class: 'flow-dot', style: { animationDelay: delay } }),
                ),
              ),
            ],
          ),
        ),
      ),
      h('div', { class: 'flow-end' }, text(props['to']) ?? ''),
    ]);
});

const Columns = functional((props, _children, place) => {
  const bars = records(props['bars']);
  const values = bars.map((bar) =>
    typeof bar['value'] === 'number' && bar['value'] > 0 ? bar['value'] : 0,
  );
  const most = Math.max(1, ...values);
  return h(
    'div',
    { ...place(), class: 'columns' },
    bars.map((bar, i) =>
      h('div', { class: 'columns-bar' }, [
        h('div', { class: 'columns-track' }, [
          h(
            'span',
            {
              class: 'columns-fill',
              style: { height: `${((values[i] ?? 0) / most) * 100}%` },
              ...data('ink', oneOf(bar['ink'], INKS)),
              ...data('mark', oneOf(bar['mark'], MARKS)),
            },
            [h('span', { class: 'columns-value' }, text(bar['value']) ?? '0')],
          ),
        ]),
        h('span', { class: 'label' }, text(bar['label']) ?? ''),
      ]),
    ),
  );
});

const Action = functional((props, _children, place) =>
  h(
    'button',
    {
      ...place(),
      type: 'button',
      class: 'action',
      ...data('ink', oneOf(props['ink'], INKS)),
      ...data('lines', oneOf(props['lines'], ['two'] as const)),
      ...data('size', oneOf(props['size'], ['large'] as const)),
      ...data('sound', oneOf(props['sound'], ['chime'] as const)),
    },
    [h('span', text(props['label']) ?? '')],
  ),
);

// A field bound with the layout's `model`. While it has focus, what the person
// is typing is the value (nova's ADAPTER.md §6): a tree arriving a round trip
// later must not overwrite it. `enter: 'clears'` empties it on Enter.
const Field: NovaComponent = stateful((props) => {
  const dispatch = useNovaDispatch();
  const narrow = inject(NarrowKey, undefined);
  const draft = ref<string | null>(null);
  return () => {
    const model = modelOf(props);
    const placeholder = text(props['placeholder']);
    return h('input', {
      ...placed(props, dispatch, narrow?.()),
      type: 'text',
      class: 'field',
      spellcheck: false,
      autocomplete: 'off',
      ...(placeholder === undefined ? {} : { placeholder }),
      value: draft.value ?? text(props['value']) ?? '',
      onFocus: () => {
        draft.value = text(props['value']) ?? '';
      },
      onBlur: () => {
        draft.value = null;
      },
      onInput: (event: Event) => {
        const next = event.target instanceof HTMLInputElement ? event.target.value : '';
        draft.value = next;
        if (model !== undefined) dispatch({ type: 'ui:model', ref: model, payload: next });
      },
      onKeydown: (event: KeyboardEvent) => {
        if (model !== undefined) dispatch({ type: 'ui:key', ref: model, key: event.key });
        if (oneOf(props['enter'], ['clears'] as const) !== undefined && event.key === 'Enter')
          draft.value = '';
      },
    });
  };
});

const Look = functional(() => h('span', { class: 'look' }));
const Xray = functional(() => h('span', { class: 'look' }));

const Menu = functional((props, children, place) =>
  h('details', { ...place(), class: 'menu' }, [h('summary', { class: 'menu-icon', 'aria-label': text(props['label']) ?? 'Menu' }), h('div', { class: 'menu-items' }, children)]),
);

// THIS KIT, whole — typed against the grammar, like the DOM and React ones.
export const VUE_KIT: KitOf<NovaComponent> = {
  Page,
  Sheet,
  Cell,
  Label,
  Headline,
  Text,
  Figure,
  Countdown,
  Code,
  Sigil,
  Qr,
  Rows,
  Bar,
  Flow,
  Columns,
  Action,
  Field,
  Look,
  Xray,
  Menu,
  Exhibit,
  Pair,
  Stack,
  Stats,
  Pipeline,
};

// moss's Vue target, with this kit. As with React (./target.ts), the DOM
// adapter's canvas and instance boxes are drawn here, because the stylesheet
// lays the screen out by them.
export const vueRenderer = (root: HTMLElement): Target => {
  const registry = createComponentRegistry<NovaComponent>();
  registry.registerAll(VUE_KIT);
  // The instance box, as the DOM kit draws it (./registry.ts).
  const slotWrapper = functional((props, children) => {
    const action = text(props['definitionId']) ?? '';
    return h('div', { 'data-action': action, 'data-instance': text(props['instanceId']) ?? '' }, [h('span', { class: 'xray-tag' }, action), ...children]);
  });
  const target = vueTarget({ root, registry, slotWrapper });
  const wire = registry.get('CanvasSlot')?.component;
  if (wire === undefined) throw new Error('moss registered no CanvasSlot');
  registry.register(
    'CanvasSlot',
    functional((props) =>
      h('div', { 'data-canvas': text(props['canvasId']) ?? '' }, [h(wire, props)]),
    ),
  );
  return target;
};
