import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@niscorp/nova';
import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { isBinding } from '@niscorp/nova/i18n';
import { componentsOf, isRecord, walkNodes } from '@niscorp/nova/reflect';
import { FRAME_LAYOUT_REF, canvasLayoutRef } from '../manifest';
import type { NiscApp, ShellCanvas, ShellManifest } from '../manifest';

export type ShellArtifacts = {
  actions: Readonly<Record<string, ActionDefinition>>;
  canvases: readonly ShellCanvas[];
  // The name of the shell's layout in the layout store.
  frame?: string;
  // The canvases its layouts hold a slot for and its manifest does not declare.
  slottedCanvases: readonly string[];
  // Of these names of the app's functions, the ones its principal's roles grant.
  grantedFunctions: (names: readonly string[]) => ReadonlySet<string>;
  layoutStore: Readonly<Record<string, LayoutNode>>;
  fragments?: Readonly<Record<string, ActionFragment>>;
  entries: ReadonlyMap<string, SeedEntry | SeedMutation>;
  components: Readonly<Record<string, NonNullable<ShellManifest['components']>[string]>>;
};

type ShellStoredLayouts = Pick<ShellArtifacts, 'canvases' | 'frame'> & { layouts: Readonly<Record<string, LayoutNode>> };

// A string is already the name of a layout the store holds, and with none nova draws its own.
const isKept = (layout: LayoutNode | string | undefined) => layout !== undefined && layout !== null && typeof layout !== 'string';

export const shellWithStoredLayouts = (shell: ShellManifest): ShellStoredLayouts => {
  const layouts: Record<string, LayoutNode> = {};
  const frame = shell.layout;
  if (isKept(frame)) layouts[FRAME_LAYOUT_REF] = frame;
  const canvases = shell.canvases.map((canvas) => {
    const layout = canvas.actionLayout;
    if (!isKept(layout)) return canvas;
    const ref = canvasLayoutRef(canvas.id);
    layouts[ref] = layout;
    return { ...canvas, actionLayout: ref };
  });
  return { canvases, ...(isKept(frame) ? { frame: FRAME_LAYOUT_REF } : typeof frame === 'string' ? { frame } : {}), layouts };
};

const slottedIn = new WeakMap<object, readonly string[]>();

// A slot whose canvas is worked out when it is drawn names none here.
const canvasesSlottedIn = (layout: object): readonly string[] => {
  const kept = slottedIn.get(layout);
  if (kept !== undefined) return kept;
  const ids = new Set<string>();
  walkNodes(layout, (node) => {
    const id = node['component'] === CANVAS_SLOT_NAME && isRecord(node['props']) ? node['props']['canvasId'] : undefined;
    if (typeof id === 'string' && id !== '' && !isBinding(id)) ids.add(id);
  });
  const found = [...ids];
  slottedIn.set(layout, found);
  return found;
};

export const slottedCanvases = (declared: readonly ShellCanvas[], layouts: readonly unknown[]): readonly string[] => {
  const ids = new Set<string>();
  for (const layout of layouts) {
    if (layout === null || typeof layout !== 'object') continue;
    for (const id of canvasesSlottedIn(layout)) ids.add(id);
  }
  for (const canvas of declared) ids.delete(canvas.id);
  return [...ids];
};

type Contract = NonNullable<ShellManifest['components']>[string];

export const shellComponents = (manifest: Pick<NiscApp, 'actions' | 'layouts'>, shell: ShellManifest): Readonly<Record<string, Contract>> => {
  // Nova's slot markers come from its default layouts, which the walk below never sees.
  const names = new Set<string>([CANVAS_SLOT_NAME, ACTION_SLOT_NAME]);
  for (const source of [manifest.actions, manifest.layouts ?? {}, shell.canvases, shell.layout ?? {}, shell.layoutStore ?? {}, shell.fragments ?? {}]) {
    for (const name of componentsOf(source)) names.add(name);
  }
  const contracts = shell.components ?? {};
  for (const name of Object.keys(contracts)) names.add(name);
  return Object.freeze(Object.fromEntries([...names].map((name) => [name, contracts[name] ?? {}])));
};

type ComponentNames = ReturnType<typeof shellComponents>;
export const createComponentNames = (read: (shell: ShellManifest) => ComponentNames): { of: (shell: ShellManifest) => ComponentNames; drop: () => void } => {
  let components = new WeakMap<ShellManifest, ComponentNames>();
  return {
    of: (shell) => {
      const kept = components.get(shell);
      if (kept !== undefined) return kept;
      const names = read(shell);
      components.set(shell, names);
      return names;
    },
    drop: () => {
      components = new WeakMap();
    },
  };
};
