import { createComponentRegistry } from '@niscorp/nova';
import type { RenderNode, Shell } from '@niscorp/nova';
import { createTtyView } from '@niscorp/nova/adapters/tty';
import type { TtyBlock, TtyComponent } from '@niscorp/nova/adapters/tty';
import { ActionSlot } from '@niscorp/nova/adapters/tty/components';
import type { KitOf } from './kit.props';
import { SIGILS, oneOf, records, text } from './kit';

// ═══════════════════════════════════════════════════════════════
// THE TEXT KIT — lyceum's grammar (./kit.props.ts) drawn as plain lines: what
// a screen SAYS, with no look at all. It is how the assistant sees the person
// it is talking to (`screenText` below): the same served trees their phone
// renders, rendered again as words — so it sees only what is on their screen,
// and only what the charter put there.
// ═══════════════════════════════════════════════════════════════

const lines = (children: TtyBlock[]): string[] => children.flatMap((child) => child.lines);
const block = (...said: string[]): TtyBlock => ({ lines: said.filter((line) => line !== '') });
const GLYPHS: Record<(typeof SIGILS)[number], string> = { triangle: '▲', circle: '●', square: '■', cross: '✚' };

const cellOf = (record: Record<string, unknown>, column: Record<string, unknown>): string => {
  const value = record[text(column['key']) ?? ''];
  if (value === null || value === undefined || value === '') return text(column['missing']) ?? '';
  if (oneOf(column['kind'], ['sigil'] as const) !== undefined) {
    const shape = oneOf(value, SIGILS);
    return shape === undefined ? '' : GLYPHS[shape];
  }
  return typeof value === 'object' ? JSON.stringify(value) : (text(value) ?? String(value));
};

const instantOf = (value: string | undefined): number =>
  value === undefined ? Number.NaN : Date.parse(value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));

export const TEXT_KIT: KitOf<TtyComponent> = {
  Page: ({ children }) => block(...lines(children)),
  Sheet: ({ children }) => block(...lines(children)),
  // An ink or a mark is how a cell looks; in words it has neither.
  Cell: ({ children }) => block(...lines(children)),
  // Capitals are the poster's look, not the words: a label reads as written.
  Label: ({ children }) => block(lines(children).join(' ')),
  Headline: ({ children }) => block(...lines(children)),
  Text: ({ children }) => block(...lines(children)),
  Figure: ({ props }) => block(`${text(props['label']) ?? ''}: ${text(props['value']) ?? '—'}`),
  Countdown: ({ props }) => {
    const to = instantOf(text(props['to']));
    const seconds = Math.ceil(Math.max(0, to - Date.now()) / 1000);
    return block(`${text(props['label']) ?? ''}: ${Number.isNaN(to) ? '—' : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`}`);
  },
  Code: ({ props }) => block(...(text(props['text']) ?? '').split('\n')),
  Sigil: ({ props }) => {
    const shape = oneOf(props['shape'], SIGILS);
    return block(shape === undefined ? '' : GLYPHS[shape]);
  },
  Qr: ({ props }) => block(`[a QR code for ${text(props['value']) ?? ''}]`),
  Rows: ({ props }) => {
    const columns = records(props['columns']);
    const rows = records(props['rows']);
    if (rows.length === 0) return block(text(props['empty']) ?? '');
    const header = columns.map((column) => text(column['label']) ?? '');
    const said = rows.map((row) => columns.map((column) => cellOf(row, column)).join(' | '));
    return block(...(header.some((label) => label !== '') ? [header.join(' | ')] : []), ...said);
  },
  Bar: ({ props }) => block(records(props['segments']).map((segment) => text(segment['value']) ?? '').filter((value) => value !== '').join(' · ')),
  Action: ({ props }) => block(`[button: ${text(props['label']) ?? ''}]`),
  Field: ({ props }) => {
    const value = text(props['value']) ?? '';
    return block(value === '' ? `[text field: ${text(props['placeholder']) ?? ''}]` : `[text field, typed: ${value}]`);
  },
  Look: () => block(),
};

const registry = createComponentRegistry<TtyComponent>();
registry.registerAll({ ...TEXT_KIT, ActionSlot });

// Which action instances to leave out of the screen — the assistant leaves its
// own conversation out, which it is handed separately.
export type Leaving = (instanceId: string, definitionId: string) => boolean;

// The screen without what `leaving` names, and without the `[n]` markers a
// terminal would print for what is pressable.
const without = (nodes: readonly RenderNode[], leaving: Leaving): RenderNode[] =>
  nodes.flatMap((node): RenderNode[] => {
    if (node.type === 'fragment') return [{ ...node, children: without(node.children, leaving) }];
    if (node.type !== 'component') return [node];
    const instance = node.props['instanceId'];
    const definition = node.props['definitionId'];
    if (node.name === 'ActionSlot' && typeof instance === 'string' && typeof definition === 'string' && leaving(instance, definition)) return [];
    const { ref: _ref, model: _model, ...plain } = node;
    return [{ ...plain, children: without(node.children, leaving) }];
  });

// A person's screen as words: their shell's served trees — the frame and each
// canvas, exactly what moss sends their phone — drawn by the text kit. A canvas
// an action's layout places (the phone's regions, the controller's) is its own
// tree, resolved where its slot is, and headed with its name.
export const screenText = (shell: Shell, leaving: Leaving): string => {
  const served = (tree: RenderNode[]): RenderNode[] => without(shell.flattenRenderTree(tree), leaving);
  const view = createTtyView(registry, {
    frame: () => served(shell.getShellRenderTree()),
    canvasTree: (canvasId) => served(shell.getCanvasRenderTree(canvasId)),
    dispatch: () => {},
    publish: () => {},
  });
  return view.render().text;
};
