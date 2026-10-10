import { ACTION_SLOT_NAME, CANVAS_SLOT_NAME } from '@niscorp/nova';
import { componentsOf } from '@niscorp/nova/reflect';
import type { NiscApp, ShellManifest } from './app';

// ═══════════════════════════════════════════════════════════════
// EVERY COMPONENT NAME A SHELL'S TREES MAY MENTION, each with the contract
// declared for it.
//
// A shell runs on the server and the components are the terminal's, so the
// server registers names: the render pipeline validates a name and serializes
// the tree, and nothing is drawn here. No list of them is ever authored. They
// are read off what mentions them: the actions in force, the layout variants,
// and the shell's own canvases, frame, layout store and fragments
// (`componentsOf`, nova/reflect, is the one walk).
// ═══════════════════════════════════════════════════════════════

// What a shell manifest declares of one component: its contract.
type Contract = NonNullable<ShellManifest['components']>[string];

export const shellComponents = (manifest: Pick<NiscApp, 'actions' | 'layouts'>, shell: ShellManifest): Readonly<Record<string, Contract>> => {
  // nova's own slot markers come from default layouts, not the app's, so the
  // walk cannot find them: they are named first.
  const names = new Set<string>([CANVAS_SLOT_NAME, ACTION_SLOT_NAME]);
  for (const source of [manifest.actions, manifest.layouts ?? {}, shell.canvases, shell.layout ?? {}, shell.layoutStore ?? {}, shell.fragments ?? {}]) {
    for (const name of componentsOf(source)) names.add(name);
  }
  // A declared contract is registered even when no authored layout mentions
  // its component: a layout written later may, and a palette must see it.
  const contracts = shell.components ?? {};
  for (const name of Object.keys(contracts)) names.add(name);
  return Object.freeze(Object.fromEntries([...names].map((name) => [name, contracts[name] ?? {}])));
};
