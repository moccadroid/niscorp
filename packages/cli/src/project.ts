import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocumentConfig, MossServer } from '@niscorp/moss';
import type { Shell } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════════
// WHAT AN APP SAYS ABOUT ITSELF — `nisc.config.ts`, at the app's root, exporting
// `project`. What only the app knows: how it stands up, and how one of its
// screens is drawn. Everything the command does is derived from those.
//
// An app is one of two things, and its config says which by what it hands over.
//
//   BEHIND MOSS — the shell lives on the server. The config hands over the
//   server; which paths exist and what each needs is read off its manifest.
//
//     export const project: NiscProject = {
//       boot: async () => ({ server: (await boot()).server }),
//       draw: (snapshot) => renderSnapshot({ snapshot, registry, slotWrapper }),
//     };
//
//   ITS OWN SHELL — the shell lives in the page (AGENTS.md, "the client-degrade
//   path"). The config hands over the app's own boot, the SAME one its browser
//   entry runs. A build runs it where there is no browser, draws the screen to
//   markup, and the page's boot picks that markup up.
//
//     export const project: NiscShellProject = {
//       shell: async () => ({ shell: (await boot()).shell }),
//       draw: (shell) => renderToString(createElement(Screen, { shell })),
//       adopt: (root, shell) => { hydrateRoot(root, createElement(Screen, { shell })); },
//     };
// ═══════════════════════════════════════════════════════════════

type Common = {
  // Where the bundler writes the terminal (default `dist`), relative to the root.
  dist?: string;
  // Where the built page's stylesheet goes. `page` (the default): written into
  // index.html as a <style>, so the first response paints the screen. `file`:
  // left as the bundler linked it — what a Content-Security-Policy that forbids
  // inline styles needs.
  stylesheet?: 'page' | 'file';
  // The app's check suite, for `nisc check` (default `src/dev/all-checks.ts`).
  checks?: string;
};

export type NiscMossProject = Common & {
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
  // What only `nisc dev` uses.
  dev?: {
    // A signed-in URL in development: `/dev/as/<who>` stores the token this
    // mints and goes to `/`. `null` is nobody of that name. It exists in the
    // dev server and nowhere else.
    signIn?: (server: MossServer, who: string) => string | null | Promise<string | null>;
  };
};

export type NiscShellProject = Common & {
  // One fresh copy of the app's shell, for one path — the boot the browser entry
  // runs. It is handed the path and NOTHING ELSE: there is no credential to pass
  // and no way to pass one, so what a build draws is the screen as nobody in
  // particular sees it. Called more than once per path (the build boots twice
  // to compare, and once more inside a DOM to adopt), so it must not memoize.
  shell: (request: { path: string }) => Promise<{ shell: Shell; close?: () => void | Promise<void> }>;
  // Draw a shell to markup where there is no browser: the app's kit through an
  // adapter's string target (`react-dom/server`, `vue/server-renderer`,
  // `@niscorp/nova/adapters/dom/server`).
  draw: (shell: Shell) => string | Promise<string>;
  // Pick the markup up: `root` already holds it, `shell` is the page's own. The
  // SAME call the browser entry makes (`hydrateRoot`, `createSSRApp().mount`,
  // nova's `mountShell`). A build runs it inside a DOM and fails on anything it
  // complains about.
  adopt: (root: HTMLElement, shell: Shell) => void | Promise<void>;
  // What the kit would put on <html> from an effect (a palette, a scheme).
  htmlAttributes?: (shell: Shell) => Record<string, string>;
  // The paths to build (default: `/`). An app that maps paths to actions lists
  // its own — only it knows them.
  paths?: () => readonly string[] | Promise<readonly string[]>;
  // How long a build waits for a screen to be whole (default 5000ms). Past it
  // the build FAILS: a file that says "loading" is not the page.
  waitMs?: number;
};

// What a config exports. Written against one of the two names above, a config's
// callbacks are typed for it (`draw`'s argument is a snapshot in one and a shell
// in the other).
export type NiscProject = NiscMossProject | NiscShellProject;

const CONFIG_NAMES = ['nisc.config.ts', 'nisc.config.mts', 'nisc.config.js', 'nisc.config.mjs'];

const has = (value: object, key: string): boolean => typeof Reflect.get(value, key) === 'function';

export const isShellProject = (project: NiscProject): project is NiscShellProject => 'shell' in project;

export const isProject = (value: unknown): value is NiscProject => {
  if (value === null || typeof value !== 'object' || !has(value, 'draw')) return false;
  const [moss, own] = [has(value, 'boot'), has(value, 'shell')];
  // one or the other — a config that hands over both has not said which it is
  return moss !== own && (moss || has(value, 'adopt'));
};

// The config's file name, if the app has one.
export const configFileOf = (root: string): string | undefined => CONFIG_NAMES.find((name) => existsSync(join(root, name)));

// Load the app's config through tsx, so it is TypeScript with the app's own
// tsconfig (its path aliases included) — the way the app's checks already run.
export const loadProject = async (root: string): Promise<NiscProject> => {
  const name = configFileOf(root);
  const file = name === undefined ? undefined : join(root, name);
  if (file === undefined) {
    throw new Error(`nisc: no nisc.config.ts in ${root}. It exports \`project\`: how the app boots, and how one of its screens is drawn.`);
  }
  const { tsImport } = await import('tsx/esm/api');
  const tsconfig = join(root, 'tsconfig.json');
  const loaded: unknown = await tsImport(pathToFileURL(file).href, { parentURL: import.meta.url, ...(existsSync(tsconfig) ? { tsconfig } : {}) });
  const project: unknown = loaded !== null && typeof loaded === 'object' ? Reflect.get(loaded, 'project') : undefined;
  if (!isProject(project)) {
    throw new Error(
      `nisc: ${file} does not export a \`project\` the command can run. It hands over EITHER \`boot\` + \`draw\` (an app behind moss) OR \`shell\` + \`draw\` + \`adopt\` (an app with its own shell).`,
    );
  }
  return project;
};
