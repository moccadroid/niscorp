import type { Producer } from '@niscorp/cortex';
import { paletteFromRegistry } from '@niscorp/nova/agent';
import { buildRegistry } from '@relay/ui';
import { catalogEntries, VIZ_OMIT_PROPS } from '../catalog';

const OMIT_COMPONENTS = new Set([
  'CanvasSlot',
  'ActionSlot',
  'Overlay',
  'Dialog',
  'DialogHead',
  'DialogTitle',
  'DialogBody',
  'DialogFoot',
  'PanelClose',
  'FormFoot',
  'Aside',
  'AssistantDock',
  'Popover',
  'PopoverPanel',
  'KanbanBoard',
  'KanbanColumn',
  'KanbanHead',
  'KanbanCards',
  'KanbanCard',
  'MenuItem',
  'SortHeader',
  'NavItem',
  'StackChip',
  'RayTrace',
  'RayView',
]);

const OMIT_PROPS = [...VIZ_OMIT_PROPS];

export const componentPalette = ((): string => {
  const registry = buildRegistry();
  const names = registry.list().filter((name) => !OMIT_COMPONENTS.has(name));
  const palette = paletteFromRegistry(registry, { include: names, omitProps: OMIT_PROPS });
  return [
    'COMPONENTS — the ONLY components a layout may use. Each: name — description, then its props JSON Schema (set only props that appear there):',
    palette
      .map((entry) => `  ${entry.name} — ${entry.description}\n    props: ${JSON.stringify(entry.propsSchema ?? {})}`)
      .join('\n'),
  ].join('\n');
}) satisfies Producer;

// Structural idioms only: a rule that names a domain, a screen or a task
// biases every future screen toward it.
export const layoutComposition = ((): string =>
  [
    'LAYOUT COMPOSITION — how layouts are put together here:',
    '- A screen body is a Stack of sections (gap 2-4). Children of a Stack stretch to FULL WIDTH.',
    '- Anything that must not stretch (a Button, a small control) goes inside a Row — Rows size children to their content.',
    '- A Row lays children out horizontally. justify "space-between" pushes them apart (heading on the left, controls on the right); align "center" lines them up:',
    '  { "component": "Row", "props": { "justify": "space-between", "align": "center" }, "children": [ <left>, <right> ] }',
    '- A metric/KPI is a Stat — bind the value as its children. Never hand-style Text into a number display.',
    '- Repeat a unit side by side with a Row (gap 3-4); stacked with a Stack.',
    '- A ref goes ON the element the user clicks, never on its container.',
    '- A Table is its own section; always set `empty`.',
  ].join('\n')) satisfies Producer;

export const actionCatalog = ((): string =>
  [
    'ACTIONS — the actions that already exist (LIVE: includes screens built this session). A `push`/`replace` step may ONLY target one of these ids, seeding only the input keys listed:',
    catalogEntries()
      .map((entry) => `  ${entry.id} — ${entry.description}\n    input: ${JSON.stringify(entry.input)}`)
      .join('\n'),
  ].join('\n')) satisfies Producer;

export const editingGuide = ((): string =>
  [
    'EDITING — the request includes the action\'s CURRENT definition. Rules:',
    '  - Change what the request requires — no more, no less.',
    '  - Preserve working parts you have no reason to touch: copy them EXACTLY, byte for byte.',
    '  - Never hotfix around a design the request invalidates: if the honest fix needs a re-proven query, a restructured data shape, or a redesigned section, make that change instead of patching symptoms.',
    '  - The result is the FULL corrected definition, re-verified like any build.',
  ].join('\n')) satisfies Producer;
