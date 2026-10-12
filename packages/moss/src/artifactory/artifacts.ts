import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@niscorp/nova';
import type { ActionDefinition, ActionFragment, LayoutNode } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { componentsOf } from '@niscorp/nova/reflect';
import type { NiscApp, ShellCanvas, ShellManifest } from '../manifest';

export type ShellArtifacts = {
  actions: Readonly<Record<string, ActionDefinition>>;
  canvases: readonly ShellCanvas[];
  frame?: LayoutNode;
  layoutStore: Readonly<Record<string, LayoutNode>>;
  fragments?: Readonly<Record<string, ActionFragment>>;
  entries: ReadonlyMap<string, SeedEntry | SeedMutation>;
  components: Readonly<Record<string, NonNullable<ShellManifest['components']>[string]>>;
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
