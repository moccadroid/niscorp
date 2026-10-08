import type { DomComponent } from '@niscorp/nova/adapters/dom';
import type { Kit } from './kit.props';
import { areaOf, codeLines, LANGS, numbers, pipelineColumns, pipelineOf, SIGIL_SHAPES, flowDelays, instantOf, narrowOf, qrOf, remaining, sheetStyle, templateOf, text, weight } from './kit.shape';

export { codeLines, LANGS, numbers, text } from './kit.shape';

// ═══════════════════════════════════════════════════════════════
// LYCEUM'S KIT — the only renderer code in the app (AGENTS.md, layout of an
// app). Domain-blind: no component knows a house, a slide or a member.
//
// CONFIGURED, NEVER STYLED. A layout says what a thing is — which grid area it
// fills, which ink, which mark — from closed sets of names; there is no `style`,
// no `className`, no colour and no size a layout can pass. An unknown value is
// dropped to the default rather than passed through: a model that writes
// `ink: 'purple'` gets paper, not purple. The look is ./tokens.ts, entirely.
//
// Geometry is the one thing a component turns into CSS itself — a sheet's
// named areas and column weights, a bar's proportions — because it is data
// (names and numbers), not style.
// ═══════════════════════════════════════════════════════════════

export const INKS = ['paper', 'ink', 'signal', 'alert', 'live', 'highlight'] as const;
export const MARKS = ['stripes', 'dots', 'bars', 'checks', 'hatch'] as const;
export const SIGILS = ['triangle', 'circle', 'square', 'cross', 'check', 'x'] as const;
export const ALIGNS = ['start', 'end', 'center', 'between', 'middle'] as const;
export const LEVELS = ['display', 'title', 'name'] as const;
// The renderers a screen can be drawn by (./target.ts): nova's DOM adapter with
// this kit, React with ./react.kit.ts, Vue with ./vue.kit.ts. One look.
export const LOOKS = ['dom', 'react', 'vue'] as const;
// THE READING GRAMMAR (nisc.dev's, on the stage): what a slide that is read
// rather than glanced at is set in — a sheet at the page scale, text in sizes,
// a document in an exhibit, two things side by side, things one under another,
// a row of figures.
export const SCALES = ['page'] as const;
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

// ── Page — the frame: canvases stacked, the last one filling the screen ──
export const Page: DomComponent = ({ children }) => el('div', 'page', children);

// ── Sheet — the ruled grid ──────────────────────────────────────
// areas: rows of area names, e.g. ['kick kick count', 'head head count'] — the
//        screen, drawn in words. `.` leaves a place empty (it shows as rule).
// cols:  one weight per column (default: equal). rows: one per row, a weight
//        or 'auto' (default: 'auto' for all but the last, which takes the rest
//        when the sheet fills).
// size:  'fill' takes the height it is given (a slide, a phone); 'auto' is as
//        tall as its content (a strip).
// narrow: { areas, rows?, cols? } — the arrangement on a phone-width screen,
//        in the same words. A cell whose area it leaves out is not shown there.
// scale: 'page' — the reading scale: every size inside fixed in rem with a
//        measure, so nothing grows with its neighbour (./tokens.ts); the
//        default grows with the cell, for a poster read from the back row.
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
  // A sheet with a narrow arrangement MARKS its cells: the ones that
  // arrangement leaves out. So it is not a component that only holds its
  // children, and says so — it is asked again when its cells change, and handed
  // the cells that stayed as it left them. The mark is therefore put on AND
  // taken off: a cell marked for one arrangement must not stay marked under the
  // next, or under none.
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

// ── Cell — a place in the grid ──────────────────────────────────
// area, ink (paper | ink | signal | alert | live | highlight), mark (stripes | dots | bars |
// checks | hatch), align (start | end | center | between), pad ('none'), scroll ('y' — a
// cell whose content may outgrow it scrolls inside it, and the sheet keeps its shape;
// 'end' — the same, held at its end: a conversation shows its newest turn).
export const Cell: DomComponent = ({ props, children }) => {
  const node = el('div', 'cell', children);
  placeIn(node, props['area']);
  setData(node, 'ink', oneOf(props['ink'], INKS));
  setData(node, 'mark', oneOf(props['mark'], MARKS));
  setData(node, 'align', oneOf(props['align'], ALIGNS));
  setData(node, 'pad', oneOf(props['pad'], ['none'] as const));
  setData(node, 'scroll', oneOf(props['scroll'], ['y', 'end'] as const));
  return node;
};

// ── Label — the small spaced capitals ───────────────────────────
export const Label: DomComponent = ({ children }) => el('span', 'label', children);

// ── Headline — what is read from the back row ───────────────────
// level: display (the one thing on a slide) | title | name.
export const Headline: DomComponent = ({ props, children }) => {
  const level = oneOf(props['level'], LEVELS) ?? 'title';
  const node = el(level === 'display' ? 'h1' : 'h2', 'headline', children);
  setData(node, 'level', level);
  return node;
};

// ── Text — sentences ────────────────────────────────────────────
// tone ('muted'); size (body | lede | small | fine — at the page scale).
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

// ── Figure — a number, and what it counts ───────────────────────
export const Figure: DomComponent = ({ props }) => {
  const label = el('span', 'label');
  label.textContent = text(props['label']) ?? '';
  const value = el('span', 'value');
  value.textContent = text(props['value']) ?? '—';
  return el('div', 'figure', [label, value]);
};

// ── Countdown — time left until an instant, ticking where it is shown ──
// to: the instant (ISO, or Postgres's own "YYYY-MM-DD HH:MM:SS+ZZ"); label:
// what it counts down to. The one thing here on the viewer's clock rather than
// the server's: a tree re-sent every second would be a render a second for
// nothing, so the kit ticks it. Nothing to count to: a dash. At zero it stays
// at zero, marked done.
// Ticks `value` down to `to` inside `node`.
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

// ── Code — mono, with the lines that matter marked ──────────────
// text: the source; marked: 1-based line numbers to mark.
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

// ── Sigil — a shape ─────────────────────────────────────────────
// shape: triangle | circle | square | cross | check | x. size: 'large' or text size.
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

// ── Qr — a value as a QR code ───────────────────────────────────
// value: what the code says (an address). Drawn as one SVG path of square
// modules with the standard quiet zone, ink on paper, as large as its place;
// the look decides the size. An empty value draws nothing.
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

// ── Rows — a ruled table ────────────────────────────────────────
// rows: the records; rowKey: the id field; empty: what an empty table says.
// columns: [{ label, key, w?, kind?: 'text' | 'mono' | 'sigil', missing? }] —
// `missing` is what a cell says when its value is absent. Columns with no
// labels at all make a table with no header row (a list of lines).
export const Rows: DomComponent = ({ props, dispatch }) => {
  const columns = records(props['columns']);
  // A row you can press: `rowRef` names the click, `clickKey` the field its
  // payload is (default rowKey) — nova's own Table convention. `selected` marks
  // the row whose `clickKey` equals it.
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
        // No shape: the column's `missing` words, as for any other kind.
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

// ── Bar — proportions as cells ──────────────────────────────────
// segments: [{ value, ink?, mark? }].
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

// ── Flow — two ends, and what passes between them ─────────────────
// from, to: what each end is. lanes: [{ label, toward: 'to' | 'from', ink? }] —
// one lane per kind of message, its dots running toward the end it names. The
// dots never stop. Each lane starts where the wall clock says it is, not at its
// beginning, so a flow that is built again (its own props changed, or the sheet
// around it was asked again and moved it) does not make the dots jump back.
// (nova's DOM adapter used to draw the whole page again on every update, which
// is what this was first written for; it keeps what did not change now, and
// this covers the times a flow still is built or moved.)
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

// ── Columns — numbers as bars, side by side ─────────────────────
// bars: [{ label, value, ink?, mark? }]. Heights are proportional to the
// largest; each bar carries its value on top of it and its label under it.
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

// ── Action — a whole cell you press ─────────────────────────────
// area, ink, label, lines ('two' — the label always takes exactly two lines,
// clamped: a row of actions whose labels change keeps its height), size
// ('large' — the one thing a screen is for, like the door's Step in). Pressed, it
// is a `ui:click` on its `ref` (nova's convention — the renderer wires it, the
// component knows nothing of events).
export const Action: DomComponent = ({ props }) => {
  const label = el('span', '');
  label.textContent = text(props['label']) ?? '';
  const node = el('button', 'action', [label]);
  node.setAttribute('type', 'button');
  placeIn(node, props['area']);
  setData(node, 'ink', oneOf(props['ink'], INKS));
  setData(node, 'lines', oneOf(props['lines'], ['two'] as const));
  setData(node, 'size', oneOf(props['size'], ['large'] as const));
  // A sound it plays where it is pressed — the page plays it (./target.ts).
  setData(node, 'sound', oneOf(props['sound'], ['chime'] as const));
  return node;
};

// ── Field — a line of text somebody types ───────────────────────
// area, placeholder, value, enter ('clears'). Bound with the layout's `model`
// (nova wires the typing by that convention); `value` is what the field shows
// when it renders.
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

// A field whose Enter SENDS it (`enter: 'clears'`) empties when Enter is
// pressed. The browser keeps a focused field's typing over whatever the server
// sends — so a server that empties the field is not seen while the person is
// still in it; the field has to say so itself. The text already went up with
// every keystroke; Enter only says "send".
export const clearsOnEnter = (node: HTMLInputElement, enter: unknown): void => {
  if (oneOf(enter, ['clears'] as const) === undefined) return;
  node.addEventListener('keydown', (event) => {
    if (event instanceof KeyboardEvent && event.key === 'Enter') node.value = '';
  });
};

// ── Look — which kit paints the screen ──────────────────────────
// look: dom | react | vue. Shows nothing: the terminal reads it off the tree
// (./target.ts). Every kit has it, so whichever is painting finds it.
export const Look: DomComponent = () => el('span', 'look');

// ── Menu — an icon that opens a list of things to press ─────────
// area, label (what a screen reader calls it). Its children are the entries —
// Actions, mostly. The browser's own <details> opens and closes it, so no
// renderer keeps the state.
//
// An entry that is pressed closes the menu. That used to happen by itself: the
// adapter drew the whole page again on every update, and a <details> drawn
// again is a closed one. The element stays now, so the menu says it. Caught on
// the way down, because an entry's own press does not let the click travel up.
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

// ── Xray — whether the screen shows the actions it is made of ───
// on: boolean. Shows nothing, like Look: the terminal reads it off the frame.
export const Xray: DomComponent = () => el('span', 'look');

// THIS KIT, whole — typed against the grammar, so a component the grammar
// names and the kit lacks does not compile.
export const POSTER_KIT: Kit = { Page, Sheet, Cell, Label, Headline, Text, Figure, Countdown, Code, Sigil, Qr, Rows, Bar, Flow, Columns, Action, Field, Look, Xray, Menu, Exhibit, Pair, Stack, Stats, Pipeline };
