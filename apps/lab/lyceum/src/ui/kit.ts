import type { DomComponent } from '@niscorp/nova/adapters/dom';
import type { Kit } from './kit.props';
import { areaOf, codeLines, fitOf, LANGS, numbers, pipelineColumns, pipelineOf, SIGIL_SHAPES, flowDelays, instantOf, narrowOf, qrOf, remaining, sheetStyle, templateOf, text, weight } from './kit.shape';

export { codeLines, LANGS, numbers, text } from './kit.shape';

export const INKS = ['paper', 'ink', 'signal', 'alert', 'live', 'highlight'] as const;
export const MARKS = ['stripes', 'dots', 'bars', 'checks', 'hatch'] as const;
export const SIGILS = ['triangle', 'circle', 'square', 'cross', 'check', 'x'] as const;
export const ALIGNS = ['start', 'end', 'center', 'between', 'middle'] as const;
export const LEVELS = ['display', 'title', 'name'] as const;
export const LOOKS = ['dom', 'react', 'vue', 'svelte', 'angular', 'text'] as const;
// THE READING GRAMMAR (nisc.dev's, on the stage): what a slide that is read
// rather than glanced at is set in — a sheet at the page scale, text in sizes,
// a document in an exhibit, two things side by side, things one under another,
// a row of figures.
// page: the reading scale; dense: the same, a size down — a slide with a
// picture, two documents and an answer on it.
export const SCALES = ['page', 'dense'] as const;
export const SIZES = ['body', 'lede', 'small', 'fine'] as const;
export const PANES = ['paper', 'ink'] as const;
export const SPLITS = ['even', 'narrow-wide', 'wide-narrow'] as const;
export const GAPS = ['normal', 'tight'] as const;

export const oneOf = <T extends string>(value: unknown, options: readonly T[]): T | undefined =>
  options.find((option) => option === value);

export const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object' && !Array.isArray(item)) : [];

const el = (tag: string, className: string, children: Node[] = []): HTMLElement => {
  const node = document.createElement(tag);
  node.className = className;
  for (const child of children) node.appendChild(child);
  return node;
};

const setData = (node: HTMLElement, key: string, value: string | undefined): void => {
  if (value !== undefined) node.setAttribute(`data-${key}`, value);
};

const placeIn = (node: HTMLElement, area: unknown): void => {
  const name = areaOf(area);
  if (name !== undefined) node.style.gridArea = name;
};

export const Page: DomComponent = ({ children }) => el('div', 'page', children);

export const Sheet: DomComponent = ({ props, children, dependsOnChildren }) => {
  const node = el('div', 'sheet', children);
  const size = oneOf(props['size'], ['fill', 'auto'] as const) ?? 'auto';
  setData(node, 'size', size);
  setData(node, 'scale', oneOf(props['scale'], SCALES));
  const narrow = narrowOf(props['narrow'], size);
  for (const [key, value] of Object.entries(sheetStyle(templateOf(props['areas'], props['rows'], props['cols'], size), narrow, size))) {
    if (key.startsWith('--')) node.style.setProperty(key, value);
    else Reflect.set(node.style, key, value);
  }
  // A sheet with a narrow arrangement marks the cells that arrangement leaves
  // out, so it is asked again when its cells change, and is handed the cells
  // that stayed as it left them: the mark is taken off as well as put on.
  if (narrow !== undefined) {
    node.setAttribute('data-narrow', '');
    dependsOnChildren();
  }
  for (const child of children) {
    if (!(child instanceof HTMLElement)) continue;
    const area = child.style.gridArea.split(' ')[0] ?? '';
    child.toggleAttribute('data-narrow-hidden', narrow !== undefined && area !== '' && !narrow.names.has(area));
  }
  return node;
};

export const Cell: DomComponent = ({ props, children }) => {
  const node = el('div', 'cell', children);
  placeIn(node, props['area']);
  setData(node, 'ink', oneOf(props['ink'], INKS));
  setData(node, 'mark', oneOf(props['mark'], MARKS));
  setData(node, 'align', oneOf(props['align'], ALIGNS));
  setData(node, 'pad', oneOf(props['pad'], ['none'] as const));
  setData(node, 'scroll', oneOf(props['scroll'], ['y', 'end'] as const));
  setData(node, 'xray', props['xray'] === true ? '' : undefined);
  return node;
};

export const Label: DomComponent = ({ children }) => el('span', 'label', children);

export const Headline: DomComponent = ({ props, children }) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  const node = el(level === 'display' ? 'h1' : 'h2', 'headline', children);
  setData(node, 'level', level);
  return node;
};

export const Text: DomComponent = ({ props, children }) => {
  const node = el('p', 'text', children);
  setData(node, 'tone', oneOf(props['tone'], ['muted'] as const));
  setData(node, 'size', oneOf(props['size'], SIZES));
  return node;
};

// ── Exhibit — one document, set out to be read ──────────────────
// label: what it is (a file, "the statement", "sent"); text: the document;
// lang (json | sql | ts): set in colour; tone (paper | ink): the pane; flag
// (an ink): the caption wears it — orange for a draft that failed, green for
// one that ran; marked: 1-based lines to mark. Code lives here and nowhere
// beside prose.
export const Exhibit: DomComponent = ({ props }) => {
  const caption = el('figcaption', '');
  caption.textContent = text(props['label']) ?? '';
  const lines = codeLines(text(props['text']) ?? '', oneOf(props['lang'], LANGS), numbers(props['marked'])).map((line) => {
    const node = el('span', '');
    node.innerHTML = line.html;
    if (line.marked) node.setAttribute('data-marked', '');
    return node;
  });
  const node = el('figure', 'exhibit', [caption, el('pre', '', lines)]);
  placeIn(node, props['area']);
  // Said, so the look can wrap a document that is words rather than code.
  setData(node, 'lang', oneOf(props['lang'], LANGS));
  setData(node, 'tone', oneOf(props['tone'], PANES));
  setData(node, 'flag', oneOf(props['flag'], INKS));
  const fit = fitOf(props['fit'], text(props['text']) ?? '');
  if (fit !== undefined) {
    node.setAttribute('data-fit', '');
    for (const [name, value] of Object.entries(fit)) node.style.setProperty(name, value);
  }
  return node;
};

// ── Pair — two things side by side ──────────────────────────────
// split: even | narrow-wide | wide-narrow. One under the other where there is no room.
export const Pair: DomComponent = ({ props, children }) => {
  const node = el('div', 'pair', children);
  placeIn(node, props['area']);
  setData(node, 'split', oneOf(props['split'], SPLITS));
  return node;
};

// ── Stack — things one under another ────────────────────────────
// gap: normal | tight; scroll: 'y' — a stack that may outgrow its place scrolls inside it.
export const Stack: DomComponent = ({ props, children }) => {
  const node = el('div', 'stack', children);
  placeIn(node, props['area']);
  setData(node, 'gap', oneOf(props['gap'], GAPS));
  setData(node, 'scroll', oneOf(props['scroll'], ['y'] as const));
  return node;
};

// ── Stats — a row of figures, each with what it counts ──────────
// items: [{ label, value, ink? }].
export const Stats: DomComponent = ({ props }) => {
  const items = records(props['items']).map((item) => {
    const value = el('b', '');
    value.textContent = text(item['value']) ?? '—';
    const label = el('span', '');
    label.textContent = text(item['label']) ?? '';
    const node = el('div', '', [value, label]);
    setData(node, 'ink', oneOf(item['ink'], INKS));
    return node;
  });
  const node = el('div', 'stats', items);
  placeIn(node, props['area']);
  return node;
};

// ── Pipeline — a line of steps, and one detour under it ─────────
// steps: [{ label, value, note?, ink?, off? }] — what always runs, in order; a
// step that did not happen is `off`; `note` is set apart in its corner (how
// long it took). detour: { from, to, label, enter, leave,
// direct, off, steps } — what runs only sometimes, leaving the line at step
// `from` and coming back at step `to`; `direct` names the link it stands in
// for. legend: [{ label, ink? }] — what the inks mean.
const pipelineStep = (step: { label: string; value: string; note: string; ink: string | undefined; off: boolean }): HTMLElement => {
  const label = el('b', '');
  label.textContent = step.label;
  const note = el('i', '');
  note.textContent = step.note;
  const value = el('span', '');
  value.textContent = step.value;
  const node = el('div', 'pipeline-step', [label, note, value]);
  setData(node, 'ink', oneOf(step.ink, INKS));
  if (step.off) node.setAttribute('data-off', '');
  return node;
};
const pipelineLink = (className: string, said: string, off: boolean): HTMLElement => {
  const label = el('span', '');
  label.textContent = said;
  const node = el('div', className, [label]);
  if (off) node.setAttribute('data-off', '');
  return node;
};
export const Pipeline: DomComponent = ({ props }) => {
  const shape = pipelineOf(props);
  const at = (node: HTMLElement, column: string, row: number): HTMLElement => {
    node.style.gridColumn = column;
    node.style.gridRow = String(row);
    return node;
  };
  const line = shape.steps.flatMap((step, index) => {
    const link = shape.links[index];
    return [at(pipelineStep(step), String(index * 2 + 1), 1), ...(link === undefined ? [] : [at(pipelineLink('pipeline-link', link.label, link.off), String(index * 2 + 2), 1)])];
  });
  const detour = shape.detour;
  const under =
    detour === undefined
      ? []
      : [
          at(pipelineLink('pipeline-enter', detour.enter, detour.off), String(detour.from * 2 + 1), 2),
          at(pipelineLink('pipeline-leave', detour.leave, !detour.back), String(detour.to * 2 + 1), 2),
          (() => {
            const label = el('span', 'pipeline-said');
            label.textContent = detour.label;
            const inner = el('div', 'pipeline-inner', detour.steps.flatMap((step, index) => [...(index === 0 ? [] : [pipelineLink('pipeline-link', '', step.off)]), pipelineStep(step)]));
            const box = at(el('div', 'pipeline-detour', [label, inner]), `${detour.from * 2 + 1} / ${detour.to * 2 + 2}`, 3);
            if (detour.off) box.setAttribute('data-off', '');
            return box;
          })(),
        ];
  const legend = shape.legend.map((item) => {
    const node = el('span', '');
    node.textContent = item.label;
    setData(node, 'ink', oneOf(item.ink, INKS));
    return node;
  });
  const key = at(el('div', 'pipeline-legend', legend), `${(detour?.to ?? 0) * 2 + 3} / -1`, 3);
  const node = el('div', 'pipeline', [...line, ...under, ...(legend.length === 0 ? [] : [key])]);
  node.style.gridTemplateColumns = pipelineColumns(shape.steps.length);
  placeIn(node, props['area']);
  return node;
};

export const Figure: DomComponent = ({ props }) => {
  const label = el('span', 'label');
  label.textContent = text(props['label']) ?? '';
  const value = el('span', 'value');
  value.textContent = text(props['value']) ?? '—';
  return el('div', 'figure', [label, value]);
};

// On the viewer's clock rather than the server's: a tree re-sent every second
// would be a render a second for nothing.
const tickDown = (node: HTMLElement, value: HTMLElement, toProp: unknown): void => {
  const to = instantOf(text(toProp));
  const paint = (): boolean => {
    const now = remaining(to, Date.now());
    value.textContent = now.shown;
    if (now.done) node.setAttribute('data-done', '');
    return now.running;
  };
  if (paint()) {
    // Stops at zero, or once the node has been on the page and left it.
    let shown = false;
    const timer = setInterval(() => {
      shown ||= node.isConnected;
      if ((shown && !node.isConnected) || !paint()) clearInterval(timer);
    }, 1000);
  }
};

export const Countdown: DomComponent = ({ props }) => {
  const label = el('span', 'label');
  label.textContent = text(props['label']) ?? '';
  const value = el('span', 'value');
  const node = el('div', 'figure countdown', [label, value]);
  tickDown(node, value, props['to']);
  return node;
};

export const Code: DomComponent = ({ props }) => {
  const marked = new Set(Array.isArray(props['marked']) ? props['marked'].filter((n): n is number => typeof n === 'number') : []);
  const lines = (text(props['text']) ?? '').split('\n').map((line, i) => {
    const node = el('span', '');
    node.textContent = line === '' ? ' ' : line;
    if (marked.has(i + 1)) node.setAttribute('data-marked', '');
    return node;
  });
  return el('div', 'code', lines);
};

const SVG = 'http://www.w3.org/2000/svg';
const sigil = (shape: unknown, large: boolean): HTMLElement => {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'sigil');
  svg.setAttribute('aria-hidden', 'true');
  if (large) svg.setAttribute('data-size', 'large');
  const known = oneOf(shape, SIGILS);
  for (const part of known === undefined ? [] : SIGIL_SHAPES[known]) {
    const node = document.createElementNS(SVG, part.tag);
    for (const [key, value] of Object.entries(part.attrs)) node.setAttribute(key, value);
    svg.appendChild(node);
  }
  const holder = el('span', '');
  holder.appendChild(svg);
  return holder;
};

export const Sigil: DomComponent = ({ props }) => sigil(props['shape'], props['size'] === 'large');

const withHead = (node: HTMLElement, head: boolean): HTMLElement => {
  if (head) node.setAttribute('data-head', '');
  return node;
};

export const Qr: DomComponent = ({ props }) => {
  const value = text(props['value']) ?? '';
  const holder = el('span', 'qr');
  if (value === '') return holder;
  const qr = qrOf(value);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', qr.viewBox);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', value);
  const ground = document.createElementNS(SVG, 'rect');
  ground.setAttribute('width', '100%');
  ground.setAttribute('height', '100%');
  ground.setAttribute('class', 'qr-ground');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', qr.d);
  svg.append(ground, path);
  holder.appendChild(svg);
  return holder;
};

export const Rows: DomComponent = ({ props, dispatch }) => {
  const columns = records(props['columns']);
  const rowRef = text(props['rowRef']);
  const clickKey = text(props['clickKey']) ?? text(props['rowKey']) ?? '';
  const selected = props['selected'];
  const cols = columns.map((column) => `${weight(column['w']) ?? 1}fr`).join(' ');
  const line = (cells: HTMLElement[]): HTMLElement => {
    const row = el('div', '', cells);
    row.style.setProperty('--cols', cols);
    return row;
  };
  const labelled = columns.some((column) => (text(column['label']) ?? '') !== '');
  const header = line(columns.map((column) => {
    const cell = el('span', '');
    cell.textContent = text(column['label']) ?? '';
    return cell;
  }));
  const head = labelled ? [header] : [];
  const body = records(props['rows']).map((record) => {
    const row = line(columns.map((column) => {
      const cell = el('span', '');
      const kind = oneOf(column['kind'], ['text', 'mono', 'sigil'] as const) ?? 'text';
      const value = record[text(column['key']) ?? ''];
      if (kind === 'sigil') {
        if (value !== null && value !== undefined) cell.appendChild(sigil(value, false));
        else {
          cell.setAttribute('data-kind', 'missing');
          cell.textContent = text(column['missing']) ?? '';
        }
      } else if (value === null || value === undefined || value === '') {
        cell.setAttribute('data-kind', 'missing');
        cell.textContent = text(column['missing']) ?? '';
      } else {
        cell.setAttribute('data-kind', kind);
        cell.textContent = text(value) ?? '';
      }
      return cell;
    }));
    const key = record[clickKey];
    if (selected !== undefined && selected !== null && key === selected) row.setAttribute('data-selected', '');
    if (rowRef !== undefined) {
      row.setAttribute('data-press', '');
      row.addEventListener('click', () => dispatch({ type: 'ui:click', ref: rowRef, payload: key }));
    }
    return row;
  });
  if (body.length === 0) {
    const empty = el('div', 'empty');
    empty.textContent = text(props['empty']) ?? '';
    return withHead(el('div', 'rows', [...head, empty]), labelled);
  }
  return withHead(el('div', 'rows', [...head, ...body]), labelled);
};

export const Bar: DomComponent = ({ props }) => {
  const segments = records(props['segments']).filter((segment) => typeof segment['value'] === 'number' && segment['value'] > 0);
  const parts = segments.map((segment) => {
    const part = el('span', '');
    setData(part, 'ink', oneOf(segment['ink'], INKS));
    setData(part, 'mark', oneOf(segment['mark'], MARKS));
    return part;
  });
  const node = el('div', 'bar', parts);
  node.style.gridTemplateColumns = segments.map((segment) => `${text(segment['value']) ?? '1'}fr`).join(' ') || '1fr';
  return node;
};

// Each lane starts where the wall clock says it is, not at its beginning, so a
// flow that is built again does not make the dots jump back.
const TOWARDS = ['to', 'from'] as const;

export const Flow: DomComponent = ({ props }) => {
  const end = (value: unknown): HTMLElement => {
    const node = el('div', 'flow-end');
    node.textContent = text(value) ?? '';
    return node;
  };
  const delays = flowDelays(Date.now());
  const lanes = records(props['lanes']).map((lane) => {
    const label = el('span', 'label');
    label.textContent = text(lane['label']) ?? '';
    const dots = delays.map((delay) => {
      const dot = el('span', 'flow-dot');
      dot.style.animationDelay = delay;
      return dot;
    });
    const node = el('div', 'flow-lane', [label, el('div', 'flow-track', dots)]);
    setData(node, 'toward', oneOf(lane['toward'], TOWARDS) ?? 'to');
    setData(node, 'ink', oneOf(lane['ink'], INKS));
    return node;
  });
  return el('div', 'flow', [end(props['from']), el('div', 'flow-lanes', lanes), end(props['to'])]);
};

export const Columns: DomComponent = ({ props }) => {
  const bars = records(props['bars']);
  const values = bars.map((bar) => (typeof bar['value'] === 'number' && bar['value'] > 0 ? bar['value'] : 0));
  const most = Math.max(1, ...values);
  const columns = bars.map((bar, i) => {
    const value = el('span', 'columns-value');
    value.textContent = text(bar['value']) ?? '0';
    const fill = el('span', 'columns-fill', [value]);
    fill.style.height = `${((values[i] ?? 0) / most) * 100}%`;
    setData(fill, 'ink', oneOf(bar['ink'], INKS));
    setData(fill, 'mark', oneOf(bar['mark'], MARKS));
    const label = el('span', 'label');
    label.textContent = text(bar['label']) ?? '';
    return el('div', 'columns-bar', [el('div', 'columns-track', [fill]), label]);
  });
  return el('div', 'columns', columns);
};

export const Action: DomComponent = ({ props }) => {
  const label = el('span', '');
  label.textContent = text(props['label']) ?? '';
  const node = el('button', 'action', [label]);
  node.setAttribute('type', 'button');
  placeIn(node, props['area']);
  setData(node, 'ink', oneOf(props['ink'], INKS));
  setData(node, 'lines', oneOf(props['lines'], ['two'] as const));
  setData(node, 'size', oneOf(props['size'], ['large'] as const));
  setData(node, 'sound', oneOf(props['sound'], ['chime'] as const));
  return node;
};

export const Field: DomComponent = ({ props }) => {
  const node = document.createElement('input');
  node.type = 'text';
  node.className = 'field';
  node.spellcheck = false;
  node.autocomplete = 'off';
  const value = text(props['value']);
  if (value !== undefined) node.value = value;
  const placeholder = text(props['placeholder']);
  if (placeholder !== undefined) node.placeholder = placeholder;
  placeIn(node, props['area']);
  clearsOnEnter(node, props['enter']);
  return node;
};

export const Check: DomComponent = ({ props }) => {
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = props['value'] === true;
  const words = el('span', '');
  words.textContent = text(props['label']) ?? '';
  const node = el('label', 'check', [box, words]);
  placeIn(node, props['area']);
  return node;
};

// The browser keeps a focused field's typing over whatever the server sends,
// so a server that empties the field is not seen while the person is still in
// it: the field empties itself.
export const clearsOnEnter = (node: HTMLInputElement, enter: unknown): void => {
  if (oneOf(enter, ['clears'] as const) === undefined) return;
  node.addEventListener('keydown', (event) => {
    if (event instanceof KeyboardEvent && event.key === 'Enter') node.value = '';
  });
};

// Shows nothing: the render target reads `look` off the tree.
export const Look: DomComponent = () => el('span', 'look');

// An entry that is pressed closes the menu. Caught on the way down, because an
// entry's own press does not let the click travel up.
export const Menu: DomComponent = ({ props, children }) => {
  const icon = el('summary', 'menu-icon');
  icon.setAttribute('aria-label', text(props['label']) ?? 'Menu');
  const items = el('div', 'menu-items', children);
  const node = el('details', 'menu', [icon, items]);
  node.addEventListener(
    'click',
    (event) => {
      if (event.target instanceof Node && items.contains(event.target)) node.removeAttribute('open');
    },
    true,
  );
  placeIn(node, props['area']);
  return node;
};

// Shows nothing, like Look: the render target reads it off the frame.
export const Xray: DomComponent = () => el('span', 'look');

export const POSTER_KIT: Kit = { Page, Sheet, Cell, Label, Headline, Text, Figure, Countdown, Code, Sigil, Qr, Rows, Bar, Flow, Columns, Action, Field, Check, Look, Xray, Menu, Exhibit, Pair, Stack, Stats, Pipeline };
