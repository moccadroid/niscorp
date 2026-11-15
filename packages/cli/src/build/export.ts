import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { distOf, loadProject, say } from '../project';
import type { CommandOptions, NiscProject } from '../project';
import { build } from './build';
import type { BuildResult } from './build';
import { fileOf } from './routes';

const write = (options: CommandOptions, project: NiscProject, out: string, routes: readonly { path: string; html: string }[]): void => {
  rmSync(out, { recursive: true, force: true });
  cpSync(distOf(options.root, project), out, { recursive: true });
  for (const route of routes) {
    const file = join(out, fileOf(route.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, route.html);
  }
  say(options)('');
  say(options)(`nisc: ${routes.length} paths written to ${out}`);
};

const isWithin = (folder: string, path: string): boolean => {
  const way = relative(folder, path);
  return way === '' || (way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way));
};

const refuseOut = (out: string, root: string, dist: string): void => {
  const what = isWithin(out, root) ? `the app's folder (${root}) or a folder above it` : isWithin(out, dist) || isWithin(dist, out) ? `the built app (${dist}), a folder inside it or one above it` : undefined;
  if (what === undefined) return;
  throw new Error(`nisc: --out ${out} is ${what}, and an export empties its folder before writing to it. Nothing was written. Give the export a folder of its own: \`--out out\`.`);
};

export const exportSite = async (options: CommandOptions): Promise<{ written: boolean; result: BuildResult; out: string }> => {
  const project = await loadProject(options.root);
  const out = resolve(options.root, options.out ?? 'out');
  refuseOut(out, options.root, distOf(options.root, project));
  const result = await build(options);
  if (result.kind === 'shell') {
    if (!result.ok) {
      const failed = result.routes.filter((route) => route.problems.length > 0);
      say(options)('');
      say(options)(`nisc: ${failed.length} of ${result.routes.length} paths failed a check (${failed.map((route) => route.path).join(', ')}). Nothing was written.`);
      return { written: false, result, out };
    }
    write(options, project, out, result.routes);
    return { written: true, result, out };
  }
  const routes = result.routes;
  const pathsOf = (some: typeof routes): string => some.map((route) => route.path).join(', ');
  const live = routes.filter((route) => route.drawn && route.live);
  const undrawn = routes.filter((route) => !route.drawn);
  if (live.length + undrawn.length > 0 && options.allowLive !== true) {
    say(options)('');
    if (live.length > 0) say(options)(`nisc: ${live.length} of ${routes.length} paths cannot be a file alone (${pathsOf(live)}).`);
    if (undrawn.length > 0) {
      say(options)(`nisc: ${undrawn.length} of ${routes.length} paths could not be drawn (see the table): it would go out as the template, empty until its terminal connects (${pathsOf(undrawn)}).`);
    }
    say(options)(live.length > 0 ? '      Nothing was written. With a server beside the files they still work: `nisc export --allow-live`.' : '      Nothing was written.');
    return { written: false, result, out };
  }
  write(options, project, out, routes);
  for (const route of undrawn) say(options)(`nisc: ${route.path} could not be drawn — written as the template; it shows nothing until its terminal connects.`);
  return { written: true, result, out };
};
