import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { DocumentConfig, MossServer, NiscApp, NiscRuntime } from '@niscorp/moss';
import type { Shell } from '@niscorp/nova';

type Common = {
  // Default `dist`, relative to the root.
  dist?: string;
  // Default `page`: a <style> in index.html. `file` is for a Content-Security-Policy that forbids inline styles.
  stylesheet?: 'page' | 'file';
  // Default `src/dev/all-checks.ts`.
  checks?: string;
  site?: string;
};

export type NiscMossProject = Common & {
  boot: () => Promise<{ server: MossServer; close?: () => void | Promise<void> }>;
  draw: DocumentConfig['draw'];
  htmlAttributes?: DocumentConfig['htmlAttributes'];
  // Default `nisc.token`.
  tokenKey?: string;
  // Default: `/`, and every page whose path has no parameter.
  paths?: (server: MossServer) => readonly string[] | Promise<readonly string[]>;
  // `nisc start` registers these before the site's catch-all; `nisc dev` registers them too, and sends them the paths `dev.owned` names.
  routes?: (server: MossServer) => void | Promise<void>;
  // For `nisc migrate`. `runtime` opens the environment and nothing else:
  // tables it migrated itself are changed before the step can check them.
  app?: NiscApp;
  runtime?: () => Promise<NiscRuntime & { close?: () => void | Promise<void> }>;
  dev?: {
    // The token `/dev/as/<who>` stores; `null` is nobody of that name.
    signIn?: (server: MossServer, who: string) => string | null | Promise<string | null>;
    // Default: this machine only. With it, anybody who can reach the dev server signs in as anybody.
    signInFromNetwork?: boolean;
    // Default: `src/app`, `src/server`, `src/db`, `src/ui` and the config.
    watch?: RegExp;
    // Paths that go to the app server and not to vite. Default: moss's own
    // prefixes; an app with routes of its own names those and its own.
    owned?: RegExp;
  };
};

export type NiscShellProject = Common & {
  // Called more than once per path (a build boots twice to compare, and once
  // more inside a DOM to adopt), so it must not memoize.
  shell: (request: { path: string }) => Promise<{ shell: Shell; close?: () => void | Promise<void> }>;
  draw: (shell: Shell) => string | Promise<string>;
  // `root` already holds the drawn markup: the browser entry's own call (`hydrateRoot`, `createSSRApp().mount`, nova's `mountShell`).
  adopt: (root: HTMLElement, shell: Shell) => void | Promise<void>;
  htmlAttributes?: (shell: Shell) => Record<string, string>;
  // Default: `/`.
  paths?: () => readonly string[] | Promise<readonly string[]>;
  // Default 5000. Past it the build fails.
  waitMs?: number;
};

export type NiscProject = NiscMossProject | NiscShellProject;

const CONFIG_NAMES = ['nisc.config.ts', 'nisc.config.mts', 'nisc.config.js', 'nisc.config.mjs'];

const has = (value: object, key: string): boolean => typeof Reflect.get(value, key) === 'function';

export const isShellProject = (project: NiscProject): project is NiscShellProject => 'shell' in project;

export const isProject = (value: unknown): value is NiscProject => {
  if (value === null || typeof value !== 'object' || !has(value, 'draw')) return false;
  const [moss, own] = [has(value, 'boot'), has(value, 'shell')];
  return moss !== own && (moss || has(value, 'adopt'));
};

const isSite = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  try {
    return ['http:', 'https:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

export const configFileOf = (root: string): string | undefined => CONFIG_NAMES.find((name) => existsSync(join(root, name)));

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
  if (project.site !== undefined && !isSite(project.site)) {
    throw new Error(`nisc: ${file} gives \`site\` as ${JSON.stringify(project.site)} — it is the address the site is served at, whole: "https://example.com".`);
  }
  return project;
};
