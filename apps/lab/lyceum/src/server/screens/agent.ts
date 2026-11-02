import { defineAgent, outputRetries, stepCount } from '@niscorp/cortex';
import type { AgentDefinition, SignalClient } from '@niscorp/cortex';
import { createComponentRegistry } from '@niscorp/nova';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { collectInteractive, layoutAgent, paletteFromRegistry } from '@niscorp/nova/agent';
import type { LayoutPaletteEntry } from '@niscorp/nova/agent';
import { createSignal } from '@niscorp/signal';
import { KIT_PROPS } from '@lyceum/ui/kit.props';

// The components a screen's layout may use, with what each one is for.
const PALETTE: Readonly<Partial<Record<keyof typeof KIT_PROPS.shape, string>>> = {
  Sheet: 'A grid. areas is its rows, top to bottom; each row is the area names in it, left to right, and an area named twice in a row is wider. A child with that area name is put there: to move a child, move its area name in areas.',
  Cell: 'A box in a Sheet, put in the area its area names; its children are what it shows.',
  Stack: 'Things one under another; its children are the things.',
  Pair: 'Two things side by side; its two children are the things.',
  Headline: 'A heading; children is the words. level title is large, name is smaller.',
  Text: 'A line of text; children is the words.',
  Label: 'A small label in capitals; children is the words.',
  Figure: 'One value shown large, with its label.',
  Stats: 'A row of figures; items is a list of { label, value }.',
  Rows: 'A table; rows is a list of records, and each column names the key it shows.',
  Action: 'A button; label is its words. Its ref is what a press does: keep it.',
  Field: 'A line to type into, bound to the data with model.',
  Check: 'A box that is ticked or not, bound with model to a yes or no.',
};

export const paletteFor = (): LayoutPaletteEntry[] => {
  const registry = createComponentRegistry<null>();
  for (const [name, description] of Object.entries(PALETTE)) {
    const propsSchema = KIT_PROPS.shape[name as keyof typeof KIT_PROPS.shape];
    registry.register(name, null, { propsSchema, description });
  }
  return paletteFromRegistry(registry);
};

// Every list a layout shows, by the data it reads it from: a loop over it, or a component handed it whole, as a table is.
const PATH = /^\$\.[\w.]+$/;
const loopsOf = (layout: unknown): string[] => {
  if (Array.isArray(layout)) return layout.flatMap(loopsOf);
  if (typeof layout !== 'object' || layout === null) return [];
  const own = 'for' in layout && typeof layout.for === 'string' ? [layout.for] : [];
  const handed = 'props' in layout && typeof layout.props === 'object' && layout.props !== null ? Object.values(layout.props).filter((value): value is string => typeof value === 'string' && PATH.test(value)) : [];
  return [...own, ...handed, ...Object.values(layout).flatMap(loopsOf)];
};

// What the layout must keep, by name: every button, every bound field and every list the screen has now.
export const keepsOf = (layout: unknown): string[] => {
  const surface = collectInteractive(layout);
  return [
    ...surface.refs.map((one) => `the ${one.component} with ref "${one.ref}"`),
    ...surface.models.map((one) => `the ${one.component} with model "${one.path}"`),
    ...[...new Set(loopsOf(layout))].map((path) => `the list over "${path}"`),
  ];
};

// The children a Sheet places, through its `if` branches, and the area names its rows give.
const placedIn = (children: unknown): Record<string, unknown>[] => {
  if (Array.isArray(children)) return children.flatMap(placedIn);
  if (typeof children !== 'object' || children === null) return [];
  if ('if' in children) return [...placedIn(Reflect.get(children, 'then')), ...placedIn(Reflect.get(children, 'else'))];
  return [children as Record<string, unknown>];
};
const areaNames = (areas: unknown): Set<string> => new Set(Array.isArray(areas) ? areas.flatMap((row) => (typeof row === 'string' ? row.split(/\s+/) : [])) : []);
const misplacedIn = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(misplacedIn);
  if (typeof node !== 'object' || node === null) return [];
  const own: string[] = [];
  if (Reflect.get(node, 'component') === 'Sheet') {
    const props = Reflect.get(node, 'props') as Record<string, unknown> | undefined;
    const names = areaNames(props?.['areas']);
    for (const child of placedIn(Reflect.get(node, 'children'))) {
      const area = (child['props'] as Record<string, unknown> | undefined)?.['area'];
      if (typeof area === 'string' && !names.has(area)) own.push(`the ${String(child['component'] ?? 'node')} is put in the area "${area}", which the Sheet's areas do not have, so it is not shown`);
    }
  }
  return [...own, ...Object.values(node).flatMap(misplacedIn)];
};

// What a layout lost of the one it was written from, and what it put where nothing is shown; nothing when it is whole.
export const flawsOf = (base: unknown, layout: unknown): string | undefined => {
  const had = collectInteractive(base);
  const has = collectInteractive(layout);
  const lost = [
    ...had.refs.filter((one) => !has.refs.some((kept) => kept.ref === one.ref)).map((one) => `it leaves out the ${one.component} with ref "${one.ref}"`),
    ...had.models.filter((one) => !has.models.some((kept) => kept.path === one.path)).map((one) => `it leaves out the ${one.component} with model "${one.path}"`),
  ];
  const flaws = [...lost, ...misplacedIn(layout)];
  return flaws.length === 0 ? undefined : `${flaws.join('; ')}.`;
};

export const styleGuideFor = (keeps: readonly string[]): string =>
  [
    'Keep every one of these, with the same ref or model, or the screen stops working:',
    ...keeps.map((keep) => `- ${keep}`),
    'A layout cannot compute anything: it shows only values that are in the data.',
    'Inside a loop, a model binds to the loop variable, as the base layout does.',
  ].join('\n');

export type Handed = { intent: string; palette: LayoutPaletteEntry[]; dataShape: unknown; styleGuide: string; base: LayoutNode };

export const handedFor = (action: ActionDefinition, base: LayoutNode, request: string): Handed => ({
  intent: request,
  palette: paletteFor(),
  dataShape: action.data ?? {},
  styleGuide: styleGuideFor(keepsOf(base)),
  base,
});

// Nova's layout agent, whose answer is not taken until it is published: a
// layout refused goes back to the model with what was said of it.
export const screenAgent = (id: string, publish: (layout: LayoutNode) => Promise<string | undefined>): AgentDefinition<LayoutNode> =>
  defineAgent<LayoutNode>({
    ...layoutAgent.config,
    id: `lyceum.layout.${id}`,
    output: {
      ...layoutAgent.config.output,
      validate: async (out) => {
        const refused = await publish(out.data);
        return refused === undefined ? { ok: true } : { retry: `This layout was refused: ${refused} Write it again without that.` };
      },
    },
    stopWhen: [stepCount(8), outputRetries(3)],
  });

export const layoutModel = (env: Record<string, string | undefined>): SignalClient | undefined =>
  env['GROQ_API_KEY'] === undefined ? undefined : createSignal('groq', { options: { reasoningEffort: 'low' } }).model('openai/gpt-oss-120b');
