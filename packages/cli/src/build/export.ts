import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { distOf, loadProject, say } from '../project';
import type { CommandOptions, NiscProject } from '../project';
import { build } from './build';
import type { BuildResult } from './build';
import { fileOf } from './routes';

const isWithin = (folder: string, path: string): boolean => {
  const way = relative(folder, path);
  return way === '' || (way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way));
};

const realOf = (path: string): string => {
  try {
    return realpathSync.native(path);
  } catch (error) {
    const code: unknown = error instanceof Error ? Reflect.get(error, 'code') : undefined;
    if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error;
    const parent = dirname(path);
    return parent === path ? path : join(realOf(parent), basename(path));
  }
};

const lstatOf = (path: string): Stats | undefined => lstatSync(path, { throwIfNoEntry: false });

// Down to its files, links and empty folders (`name/`), with `/` between names; a link is never entered.
const entriesOf = (folder: string, enters: (entry: string) => boolean = () => true, under = ''): string[] =>
  readdirSync(join(folder, under), { withFileTypes: true }).flatMap((found) => {
    const entry = under === '' ? found.name : `${under}/${found.name}`;
    if (!found.isDirectory()) return [entry];
    const inside = enters(entry) ? entriesOf(folder, enters, entry) : [];
    return inside.length > 0 ? inside : [`${entry}/`];
  });

const recordFileOf = (root: string): string => join(root, 'node_modules', '.cache', 'nisc', 'exports.json');

const recordIn = (file: string): object => {
  try {
    const record: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return record !== null && typeof record === 'object' && !Array.isArray(record) ? record : {};
  } catch {
    return {};
  }
};

const removeEmpty = (folder: string, path: string): void => {
  if (path === folder || !isWithin(folder, path) || lstatOf(path)?.isDirectory() !== true || readdirSync(path).length > 0) return;
  rmdirSync(path);
  removeEmpty(folder, dirname(path));
};

const hasNoLinkOnTheWay = (path: string): boolean => realOf(dirname(path)) === dirname(path);

// Only what lies inside the folder with no link on the way to it: a link is removed itself, never followed.
const removeListed = (folder: string, listed: readonly string[]): string[] =>
  listed.filter((entry) => {
    const path = join(folder, entry);
    if (relative(folder, path) === '' || !isWithin(folder, path) || !hasNoLinkOnTheWay(path)) return true;
    const there = lstatOf(path);
    if (there?.isDirectory() === true) removeEmpty(folder, path);
    else if (there !== undefined) unlinkSync(path);
    removeEmpty(folder, dirname(path));
    return false;
  });

const place = (from: string, to: string): void => {
  const isFolder = lstatSync(from).isDirectory();
  const there = lstatOf(to);
  if (isFolder && there?.isDirectory() === true) {
    for (const name of readdirSync(from)) place(join(from, name), join(to, name));
    return;
  }
  if (there !== undefined && (isFolder || !there.isFile())) rmSync(to, { recursive: true });
  renameSync(from, to);
};

const replaceWritten = (root: string, folder: string, fresh: string): { notRemoved: string[]; left: string[] } => {
  const file = recordFileOf(root);
  const record = recordIn(file);
  const recorded: unknown = Reflect.get(record, folder);
  const listed = (Array.isArray(recorded) ? recorded : []).flatMap((entry: unknown) => (typeof entry === 'string' ? [entry] : []));
  const written = entriesOf(fresh);
  const listedSet = new Set(listed);
  const blocked = written.filter((entry) => {
    const path = join(folder, entry);
    return !entry.endsWith('/') && hasNoLinkOnTheWay(path) && lstatOf(path)?.isDirectory() === true && entriesOf(path).some((inside) => !listedSet.has(`${entry}/${inside}`));
  });
  if (blocked.length > 0) throw new Error(`nisc: a folder with files of its own stands where the export writes a file, in ${folder}: ${blocked.join(', ')}. Nothing was written.`);
  const notRemoved = removeListed(folder, listed);
  const kept = Object.entries(record).filter(([other]) => other !== folder && existsSync(other));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(Object.fromEntries([...kept, [folder, written]]), null, 2)}\n`);
  place(fresh, folder);
  rmSync(fresh, { recursive: true });
  const writtenSet = new Set(written);
  const writtenFolders = new Set(written.flatMap((entry) => entry.split('/').slice(0, -1).map((_name, at, names) => names.slice(0, at + 1).join('/'))));
  return { notRemoved, left: entriesOf(folder, (entry) => writtenFolders.has(entry)).filter((entry) => !writtenSet.has(entry)).sort() };
};

const write = (options: CommandOptions, project: NiscProject, out: string, routes: readonly { path: string; html: string }[]): void => {
  const defaultOut = join(options.root, 'out');
  const locationOf = (path: string): string => join(realOf(dirname(path)), basename(path));
  const isDefault = locationOf(out) === locationOf(defaultOut);
  const folder = isDefault ? defaultOut : realOf(out);
  if (!isDefault && lstatOf(folder)?.isDirectory() === false) throw new Error(`nisc: --out ${out} is a file, not a folder. Nothing was written.`);
  mkdirSync(isDefault ? options.root : folder, { recursive: true });
  const fresh = mkdtempSync(join(isDefault ? options.root : folder, '.nisc-export-'));
  try {
    cpSync(distOf(options.root, project), fresh, { recursive: true });
    for (const route of routes) {
      const file = join(fresh, fileOf(route.path));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, route.html);
    }
    if (isDefault) {
      rmSync(folder, { recursive: true, force: true });
      renameSync(fresh, folder);
    }
    const { notRemoved, left } = isDefault ? { notRemoved: [], left: [] } : replaceWritten(options.root, folder, fresh);
    say(options)('');
    say(options)(`nisc: ${routes.length} paths written to ${out}`);
    if (notRemoved.length > 0) say(options)(`nisc: not removed, as its real location is not inside ${out}: ${notRemoved.join(', ')}`);
    if (left.length > 0) {
      const more = left.length > 5 ? ` and ${left.length - 5} more` : '';
      say(options)(`nisc: left as they were in ${out}, not written by this export (${left.length}): ${left.slice(0, 5).join(', ')}${more}`);
    }
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
};

const refuseOut = (out: string, root: string, dist: string): void => {
  const refusalOf = (folder: string, app: string, built: string): string | undefined =>
    isWithin(folder, app) ? `the app's folder (${root}) or a folder above it` : isWithin(folder, built) || isWithin(built, folder) ? `the built app (${dist}), a folder inside it or one above it` : undefined;
  const what = refusalOf(out, root, dist) ?? refusalOf(realOf(out), realOf(root), realOf(dist));
  if (what === undefined) return;
  throw new Error(`nisc: --out ${out} is ${what}, and an export writes over what is there. Nothing was written. Give the export a folder of its own: \`--out out\`.`);
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
