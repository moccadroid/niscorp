import type { Producer } from '@niscorp/cortex';
import { paletteFromRegistry } from '@niscorp/nova/agent';
import { buildRegistry } from '@relay/ui';
import { catalogEntries, VIZ_OMIT_PROPS } from '../catalog';

// ═══════════════════════════════════════════════════════════
// The architect-side producers — LIVE app data (component registry, action
// catalog) formatted into context. Producers run at run start, so both read
// the CURRENT state every build. Named for what they produce; shared by the
// architect (which writes layouts) and the validator (which reads them).
// ═══════════════════════════════════════════════════════════

// Kept out of the palette: structural shell components (meaningless inside a
// screen body), app chrome (dialogs, rails, kanban scaffolding —
// hand-authored screens' business), Table internals, and Ray's own surfaces.
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

// Styling props stay masked: the house style is "defaults only". Sort
// affordances are available — with the transform DSL and vex's reserved
// sortBy/sortDir, a generated screen can wire sort headers legally.
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

// Composition RULES, not solutions. Nothing here names a domain, a
// screen, or a task — baking today's answer into the prompt biases
// every future screen toward it and rots when the app changes. These
// are the structural idioms of the component set; the intent supplies
// the content.
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

// Attached only on EDIT runs (see run.ts) — editing rules never dilute build
// runs. RIGHT-SIZED, not minimal: the hotfix death spiral (patch the symptom,
// keep the broken structure, patch the next symptom it causes) is the failure
// mode this steers away from.
export const editingGuide = ((): string =>
  [
    'EDITING — the request includes the action\'s CURRENT definition. Rules:',
    '  - Change what the request requires — no more, no less.',
    '  - Preserve working parts you have no reason to touch: copy them EXACTLY, byte for byte.',
    '  - Never hotfix around a design the request invalidates: if the honest fix needs a re-proven query, a restructured data shape, or a redesigned section, make that change instead of patching symptoms.',
    '  - The result is the FULL corrected definition, re-verified like any build.',
  ].join('\n')) satisfies Producer;
