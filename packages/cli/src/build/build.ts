import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExportedDocument } from '@niscorp/moss';
import { distOf, isShellProject, loadProject, say, toolOf } from '../project';
import type { CommandOptions, NiscMossProject, NiscProject, NiscShellProject } from '../project';
import { shellRouteTable, surveyShell } from '../serve';
import type { ShellRouteReport } from '../serve';
import { defaultPaths, routeTable } from './routes';
import { writeStylesheetIntoPage } from './stylesheet';

// Moss is loaded by a dynamic import, and only for an app behind it: an app
// with its own shell does not have it installed.

const bundle = (options: CommandOptions, project: NiscProject): void => {
  const result = spawnSync(process.execPath, [toolOf(options.root, 'vite', 'vite'), 'build'], { cwd: options.root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error('nisc: the bundler failed — nothing was drawn.');
  if (project.stylesheet === 'file') return;
  const print = say(options);
  const { inPage, left } = writeStylesheetIntoPage(distOf(options.root, project));
  if (inPage.length + left.length > 0) print('');
  for (const sheet of inPage) print(`nisc: ${sheet.href} is in the page (${(sheet.bytes / 1024).toFixed(1)} kB) — one response paints it`);
  for (const sheet of left) print(`nisc: ${sheet.href} stays a file — ${sheet.why}`);
  if (inPage.length > 0) print("      A Content-Security-Policy that forbids inline styles would refuse it: `stylesheet: 'file'` in nisc.config.ts keeps it a file.");
};

const warnOfOwnAssets = (options: CommandOptions): void => {
  if (!existsSync(join(options.root, 'public', 'assets'))) return;
  say(options)('nisc: public/assets/ has files of your own. `nisc start` has browsers keep everything under /assets/ for a year, so a change to one of them will not be seen under the same name — keep them elsewhere in public/.');
};

const warnOfOneAddress = (options: CommandOptions, project: NiscProject, template: string, paths: number): void => {
  if (project.site !== undefined || paths < 2 || !/<link\b[^>]*\brel\s*=\s*["']?canonical\b/i.test(template)) return;
  say(options)('');
  say(options)(`nisc: index.html names one canonical address and this app has ${paths} paths — every file would say it lives there.`);
  say(options)('      `site: "https://…"` in nisc.config.ts gives each path its own.');
};

const templateOf =(options: CommandOptions, project: NiscProject): string => {
  const template = join(distOf(options.root, project), 'index.html');
  if (!existsSync(template)) throw new Error(`nisc: no built terminal at ${template} — run \`nisc build\`.`);
  return readFileSync(template, 'utf8');
};

const survey = async (options: CommandOptions, project: NiscMossProject): Promise<ExportedDocument[]> => {
  const template = templateOf(options, project);
  const { exportDocuments } = await import('@niscorp/moss');
  const booted = await project.boot();
  try {
    await booted.server.checkFunctions();
    const paths = project.paths === undefined ? defaultPaths(booted.server.pages) : await project.paths(booted.server);
    return await exportDocuments({
      server: booted.server,
      template,
      draw: project.draw,
      ...(project.htmlAttributes !== undefined ? { htmlAttributes: project.htmlAttributes } : {}),
      ...(project.site !== undefined ? { site: project.site } : {}),
      ...(project.tokenKey !== undefined ? { tokenKey: project.tokenKey } : {}),
      paths,
    });
  } finally {
    await booted.close?.();
  }
};

export type BuildResult =
  | { kind: 'moss'; ok: boolean; routes: ExportedDocument[] }
  | { kind: 'shell'; ok: boolean; routes: ShellRouteReport[] };

const buildShell = async (options: CommandOptions, project: NiscShellProject): Promise<BuildResult> => {
  const template = templateOf(options, project);
  const routes = await surveyShell(options.root, project, template);
  say(options)('');
  say(options)(shellRouteTable(routes));
  warnOfOneAddress(options, project, template, routes.length);
  return { kind: 'shell', ok: routes.every((route) => route.problems.length === 0), routes };
};

export const build = async (options: CommandOptions): Promise<BuildResult> => {
  const project = await loadProject(options.root);
  if (options.skipBundle !== true) bundle(options, project);
  warnOfOwnAssets(options);
  if (isShellProject(project)) return buildShell(options, project);
  const routes = await survey(options, project);
  say(options)('');
  say(options)(routeTable(routes));
  warnOfOneAddress(options, project, templateOf(options, project), routes.length);
  return { kind: 'moss', ok: routes.every((route) => route.drawn), routes };
};
