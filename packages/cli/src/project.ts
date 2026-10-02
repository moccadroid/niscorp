import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocumentConfig, MossServer } from '@niscorp/moss';

// ═══════════════════════════════════════════════════════════════
// WHAT AN APP SAYS ABOUT ITSELF — `nisc.config.ts`, at the app's root, exporting
// `project`. Two things only the app knows: how it stands up, and how one of its
// screens is drawn. Everything the command does is derived from those and from
// the manifest the booted server already carries (its pages, what each needs).
//
//   export const project: NiscProject = {
//     boot: async () => ({ server: (await boot()).server }),
//     draw: (snapshot) => renderSnapshot({ snapshot, registry, slotWrapper }),
//   };
// ═══════════════════════════════════════════════════════════════

export type NiscProject = {
  // Stand the app up: the moss server, and how to let it go again. The same boot
  // the app's dev server and its checks run.
  boot: () => Promise<{ server: MossServer; close?: () => void | Promise<void> }>;
  // A terminal that draws one screen to a string — the app's kit bound to one of
  // moss's server targets (`@niscorp/moss/terminal/react/server`, …).
  draw: DocumentConfig['draw'];
  // What the kit would put on <html> from an effect (a palette, a scheme).
  htmlAttributes?: DocumentConfig['htmlAttributes'];
  // The wire's token key, when it is not `nisc.token`.
  tokenKey?: string;
  // The paths to build. Default: `/`, and every page whose path has no
  // parameter. A page with parameters ("/docs/:slug") has as many paths as there
  // are rows, and only the app knows them — list them here (`server.executeAs`
  // runs a seeded read as a charter role).
  paths?: (server: MossServer) => readonly string[] | Promise<readonly string[]>;
  // Routes of the app's own that a served site needs before the catch-all — a
  // sign-in handoff, a webhook. `nisc start` registers them first.
  routes?: (server: MossServer) => void | Promise<void>;
  // Where the bundler writes the terminal (default `dist`), relative to the root.
  dist?: string;
  // The app's check suite, for `nisc check` (default `src/dev/all-checks.ts`).
  checks?: string;
};

const CONFIG_NAMES = ['nisc.config.ts', 'nisc.config.mts', 'nisc.config.js', 'nisc.config.mjs'];

const isProject = (value: unknown): value is NiscProject =>
  value !== null && typeof value === 'object' && typeof Reflect.get(value, 'boot') === 'function' && typeof Reflect.get(value, 'draw') === 'function';

// Load the app's config through tsx, so it is TypeScript with the app's own
// tsconfig (its path aliases included) — the way the app's checks already run.
export const loadProject = async (root: string): Promise<NiscProject> => {
  const file = CONFIG_NAMES.map((name) => join(root, name)).find((candidate) => existsSync(candidate));
  if (file === undefined) {
    throw new Error(`nisc: no nisc.config.ts in ${root}. It exports \`project\`: how the app boots, and how one of its screens is drawn.`);
  }
  const { tsImport } = await import('tsx/esm/api');
  const tsconfig = join(root, 'tsconfig.json');
  const loaded: unknown = await tsImport(pathToFileURL(file).href, { parentURL: import.meta.url, ...(existsSync(tsconfig) ? { tsconfig } : {}) });
  const project: unknown = loaded !== null && typeof loaded === 'object' ? Reflect.get(loaded, 'project') : undefined;
  if (!isProject(project)) {
    throw new Error(`nisc: ${file} does not export \`project\` with a \`boot\` and a \`draw\`.`);
  }
  return project;
};
