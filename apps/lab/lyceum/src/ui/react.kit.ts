import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useNovaDispatch } from '@niscorp/nova/adapters/react';
import type { NovaComponent, NovaComponentProps } from '@niscorp/nova/adapters/react';
import type { KitOf } from './kit.props';
import { ALIGNS, INKS, LEVELS, MARKS, SIGILS, oneOf, records } from './kit';
import {
  SIGIL_SHAPES,
  areaOf,
  flowDelays,
  instantOf,
  narrowOf,
  qrOf,
  remaining,
  sheetStyle,
  templateOf,
  text,
  weight,
} from './kit.shape';

// ═══════════════════════════════════════════════════════════════
// THE POSTER KIT IN REACT — the same grammar (./kit.props.ts) as ./kit.ts, the
// same class names and data attributes, so the same stylesheet (./tokens.ts)
// makes it look the same. What differs is who builds the elements: React, from
// the trees moss's React target hands it. Nothing here knows a slide or a
// member either.
//
// nova's DOM adapter wires a node's `ref` and `model` by convention; React's
// does not, so these components do it themselves: a `ref`'d element is a
// `ui:click` whose payload is its `value`, a `model`'d field a `ui:model` per
// keystroke and a `ui:key` per key.
// ═══════════════════════════════════════════════════════════════

const h = createElement;
type Props = NovaComponentProps & Record<string, unknown>;

// The names a Sheet's narrow arrangement shows; a place it leaves out hides on
// a phone-width screen. Each Sheet sets it for its own cells.
const NarrowContext = createContext<Set<string> | undefined>(undefined);

// What every element here carries: its area (and whether the narrow
// arrangement leaves it out), and, if it is `ref`'d, the press.
// `style` is the component's own geometry, merged with its area.
const usePlaced = (props: Props, style: Record<string, string> = {}): Record<string, unknown> => {
  const dispatch = useNovaDispatch();
  const narrow = useContext(NarrowContext);
  const area = areaOf(props['area']);
  const ref = props.novaRef;
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
          onClick: (event: { stopPropagation: () => void }) => {
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

// A data attribute only when there is a value for it.
const data = (key: string, value: string | undefined): Record<string, string> =>
  value === undefined ? {} : { [`data-${key}`]: value };

const Page: NovaComponent = ({ children }: Props) =>
  h('div', { className: 'page' }, children, h('span', { className: 'renderer' }, 'React'));

const Sheet: NovaComponent = (props: Props) => {
  const size = oneOf(props['size'], ['fill', 'auto'] as const) ?? 'auto';
  const narrow = narrowOf(props['narrow'], size);
  const placed = usePlaced(
    props,
    sheetStyle(templateOf(props['areas'], props['rows'], props['cols'], size), narrow, size),
  );
  return h(
    NarrowContext.Provider,
    { value: narrow?.names },
    h(
      'div',
      {
        ...placed,
        className: 'sheet',
        'data-size': size,
        ...(narrow === undefined ? {} : { 'data-narrow': '' }),
      },
      props.children,
    ),
  );
};

const Cell: NovaComponent = (props: Props) =>
  h(
    'div',
    {
      ...usePlaced(props),
      className: 'cell',
      ...data('ink', oneOf(props['ink'], INKS)),
      ...data('mark', oneOf(props['mark'], MARKS)),
      ...data('align', oneOf(props['align'], ALIGNS)),
      ...data('pad', oneOf(props['pad'], ['none'] as const)),
      ...data('scroll', oneOf(props['scroll'], ['y', 'end'] as const)),
    },
    props.children,
  );

const Label: NovaComponent = (props: Props) =>
  h('span', { ...usePlaced(props), className: 'label' }, props.children);

const Headline: NovaComponent = (props: Props) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  return h(
    level === 'display' ? 'h1' : 'h2',
    { ...usePlaced(props), className: 'headline', 'data-level': level },
    props.children,
  );
};

const Text: NovaComponent = (props: Props) =>
  h(
    'p',
    {
      ...usePlaced(props),
      className: 'text',
      ...data('tone', oneOf(props['tone'], ['muted'] as const)),
    },
    props.children,
  );

const Figure: NovaComponent = (props: Props) =>
  h(
    'div',
    { ...usePlaced(props), className: 'figure' },
    h('span', { className: 'label' }, text(props['label']) ?? ''),
    h('span', { className: 'value' }, text(props['value']) ?? '—'),
  );

// Ticks on the viewer's clock, as in the DOM kit; zero stays zero.
const Countdown: NovaComponent = (props: Props) => {
  const placed = usePlaced(props);
  const to = instantOf(text(props['to']));
  const [now, setNow] = useState(() => Date.now());
  const left = remaining(to, now);
  useEffect(() => {
    if (!left.running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left.running]);
  return h(
    'div',
    { ...placed, className: 'figure countdown', ...(left.done ? { 'data-done': '' } : {}) },
    h('span', { className: 'label' }, text(props['label']) ?? ''),
    h('span', { className: 'value' }, left.shown),
  );
};

const Code: NovaComponent = (props: Props) => {
  const marked = new Set(
    Array.isArray(props['marked'])
      ? props['marked'].filter((n): n is number => typeof n === 'number')
      : [],
  );
  const lines = (text(props['text']) ?? '').split('\n');
  return h(
    'div',
    { ...usePlaced(props), className: 'code' },
    lines.map((line, i) =>
      h(
        'span',
        { key: i, ...(marked.has(i + 1) ? { 'data-marked': '' } : {}) },
        line === '' ? ' ' : line,
      ),
    ),
  );
};

const sigil = (shape: unknown, large: boolean, key?: number): ReactNode => {
  const known = oneOf(shape, SIGILS);
  return h(
    'span',
    { key },
    h(
      'svg',
      {
        viewBox: '0 0 100 100',
        className: 'sigil',
        'aria-hidden': 'true',
        ...(large ? { 'data-size': 'large' } : {}),
      },
      (known === undefined ? [] : SIGIL_SHAPES[known]).map((part, i) =>
        h(part.tag, { key: i, ...part.attrs }),
      ),
    ),
  );
};

const Sigil: NovaComponent = (props: Props) =>
  h('span', usePlaced(props), sigil(props['shape'], props['size'] === 'large'));

const Qr: NovaComponent = (props: Props) => {
  const placed = usePlaced(props);
  const value = text(props['value']) ?? '';
  if (value === '') return h('span', { ...placed, className: 'qr' });
  const qr = qrOf(value);
  return h(
    'span',
    { ...placed, className: 'qr' },
    h(
      'svg',
      { viewBox: qr.viewBox, shapeRendering: 'crispEdges', role: 'img', 'aria-label': value },
      h('rect', { width: '100%', height: '100%', className: 'qr-ground' }),
      h('path', { d: qr.d }),
    ),
  );
};

const Rows: NovaComponent = (props: Props) => {
  const placed = usePlaced(props);
  const dispatch = useNovaDispatch();
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
          columns.map((column, i) => h('span', { key: i }, text(column['label']) ?? '')),
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
      columns.map((column, i) => {
        const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
        const value = record[text(column['key']) ?? ''];
        if (kind === 'sigil')
          return value === null || value === undefined
            ? h('span', { key: i, 'data-kind': 'missing' }, text(column['missing']) ?? '')
            : h('span', { key: i }, sigil(value, false));
        if (value === null || value === undefined || value === '')
          return h('span', { key: i, 'data-kind': 'missing' }, text(column['missing']) ?? '');
        return h('span', { key: i, 'data-kind': kind }, text(value) ?? '');
      }),
    );
  });
  const rows =
    body.length === 0
      ? [...head, h('div', { key: 'empty', className: 'empty' }, text(props['empty']) ?? '')]
      : [...head, ...body];
  return h('div', { ...placed, className: 'rows', ...(labelled ? { 'data-head': '' } : {}) }, rows);
};

const Bar: NovaComponent = (props: Props) => {
  const segments = records(props['segments']).filter(
    (segment) => typeof segment['value'] === 'number' && segment['value'] > 0,
  );
  const placed = usePlaced(props, {
    gridTemplateColumns:
      segments.map((segment) => `${text(segment['value']) ?? '1'}fr`).join(' ') || '1fr',
  });
  return h(
    'div',
    { ...placed, className: 'bar' },
    segments.map((segment, i) =>
      h('span', {
        key: i,
        ...data('ink', oneOf(segment['ink'], INKS)),
        ...data('mark', oneOf(segment['mark'], MARKS)),
      }),
    ),
  );
};

// The dots start where the wall clock says, once, when the Flow first draws —
// React keeps the elements across updates, so they never jump back.
const Flow: NovaComponent = (props: Props) => {
  const placed = usePlaced(props);
  const [delays] = useState(() => flowDelays(Date.now()));
  return h(
    'div',
    { ...placed, className: 'flow' },
    h('div', { className: 'flow-end' }, text(props['from']) ?? ''),
    h(
      'div',
      { className: 'flow-lanes' },
      records(props['lanes']).map((lane, i) =>
        h(
          'div',
          {
            key: i,
            className: 'flow-lane',
            'data-toward': oneOf(lane['toward'], ['to', 'from'] as const) ?? 'to',
            ...data('ink', oneOf(lane['ink'], INKS)),
          },
          h('span', { className: 'label' }, text(lane['label']) ?? ''),
          h(
            'div',
            { className: 'flow-track' },
            delays.map((delay, d) =>
              h('span', { key: d, className: 'flow-dot', style: { animationDelay: delay } }),
            ),
          ),
        ),
      ),
    ),
    h('div', { className: 'flow-end' }, text(props['to']) ?? ''),
  );
};

const Columns: NovaComponent = (props: Props) => {
  const bars = records(props['bars']);
  const values = bars.map((bar) =>
    typeof bar['value'] === 'number' && bar['value'] > 0 ? bar['value'] : 0,
  );
  const most = Math.max(1, ...values);
  return h(
    'div',
    { ...usePlaced(props), className: 'columns' },
    bars.map((bar, i) =>
      h(
        'div',
        { key: i, className: 'columns-bar' },
        h(
          'div',
          { className: 'columns-track' },
          h(
            'span',
            {
              className: 'columns-fill',
              style: { height: `${((values[i] ?? 0) / most) * 100}%` },
              ...data('ink', oneOf(bar['ink'], INKS)),
              ...data('mark', oneOf(bar['mark'], MARKS)),
            },
            h('span', { className: 'columns-value' }, text(bar['value']) ?? '0'),
          ),
        ),
        h('span', { className: 'label' }, text(bar['label']) ?? ''),
      ),
    ),
  );
};

const Action: NovaComponent = (props: Props) =>
  h(
    'button',
    {
      ...usePlaced(props),
      type: 'button',
      className: 'action',
      ...data('ink', oneOf(props['ink'], INKS)),
      ...data('lines', oneOf(props['lines'], ['two'] as const)),
      ...data('size', oneOf(props['size'], ['large'] as const)),
      ...data('sound', oneOf(props['sound'], ['chime'] as const)),
    },
    h('span', null, text(props['label']) ?? ''),
  );

// A field bound with the layout's `model`. While it has focus, what the person
// is typing is the value (nova's ADAPTER.md §6): a tree arriving a round trip
// later must not overwrite it. `enter: 'clears'` empties it on Enter.
const Field: NovaComponent = (props: Props) => {
  const placed = usePlaced(props);
  const dispatch = useNovaDispatch();
  const [draft, setDraft] = useState<string | null>(null);
  const model = props.novaModel;
  const clears = oneOf(props['enter'], ['clears'] as const) !== undefined;
  const placeholder = text(props['placeholder']);
  return h('input', {
    ...placed,
    type: 'text',
    className: 'field',
    spellCheck: false,
    autoComplete: 'off',
    ...(placeholder === undefined ? {} : { placeholder }),
    value: draft ?? text(props['value']) ?? '',
    onFocus: () => setDraft(text(props['value']) ?? ''),
    onBlur: () => setDraft(null),
    onChange: (event: { target: { value: string } }) => {
      setDraft(event.target.value);
      if (model !== undefined)
        dispatch({ type: 'ui:model', ref: model.ref, payload: event.target.value });
    },
    onKeyDown: (event: { key: string }) => {
      if (model !== undefined) dispatch({ type: 'ui:key', ref: model.ref, key: event.key });
      if (clears && event.key === 'Enter') setDraft('');
    },
  });
};

const Look: NovaComponent = () => h('span', { className: 'look' });
const Xray: NovaComponent = () => h('span', { className: 'look' });

// THIS KIT, whole — typed against the grammar, like the DOM one.
export const REACT_KIT: KitOf<NovaComponent> = {
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
};
