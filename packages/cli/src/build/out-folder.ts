import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileOf } from './routes';

const STAGE = '.nisc-export-';
const IS_CASE_BLIND = process.platform === 'win32' || process.platform === 'darwin';

const codeOf = (error: unknown): unknown => (error instanceof Error ? Reflect.get(error, 'code') : undefined);

const isOwn = (error: unknown): boolean => error instanceof Error && error.message.startsWith('nisc: ');

const describe = (error: unknown): string => {
  const [code, path]: unknown[] = error instanceof Error ? [Reflect.get(error, 'code'), Reflect.get(error, 'dest') ?? Reflect.get(error, 'path')] : [];
  if (typeof code !== 'string') return error instanceof Error ? error.message : String(error);
  return typeof path === 'string' ? `${code} on ${path}` : code;
};

export const isWithin = (folder: string, path: string): boolean => {
  const way = relative(folder, path);
  return way === '' || (way !== '..' && !way.startsWith(`..${sep}`) && !isAbsolute(way));
};

export const realOf = (path: string): string => {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (codeOf(error) !== 'ENOENT' && codeOf(error) !== 'ENOTDIR') throw error;
    const parent = dirname(path);
    return parent === path ? path : join(realOf(parent), basename(path));
  }
};

// A path through a file is answered ENOTDIR on Linux and macOS, ENOENT on Windows: either way nothing is there.
const absentThroughAFile = <T>(read: () => T): T | undefined => {
  try {
    return read();
  } catch (error) {
    if (codeOf(error) === 'ENOTDIR') return undefined;
    throw error;
  }
};

const lstatOf = (path: string): Stats | undefined => absentThroughAFile(() => lstatSync(path, { throwIfNoEntry: false }));

// The same entry, by the system's own id when both exist (a link is not followed, case is as the system treats it).
export const isDefaultOut = (out: string, root: string): boolean => {
  const defaultOut = join(root, 'out');
  const [given, own] = [out, defaultOut].map((path) => absentThroughAFile(() => lstatSync(path, { bigint: true, throwIfNoEntry: false })));
  if (given !== undefined && own !== undefined && given.ino !== 0n) return given.dev === own.dev && given.ino === own.ino;
  const locationOf = (path: string): string => join(realOf(dirname(path)), basename(path));
  const [location, defaultLocation] = [locationOf(out), locationOf(defaultOut)];
  if (location === defaultLocation) return true;
  return given === undefined && own === undefined && IS_CASE_BLIND && location.toLowerCase() === defaultLocation.toLowerCase();
};

const writeRoutes = (folder: string, routes: readonly { path: string; html: string }[]): void => {
  for (const route of routes) {
    const file = join(folder, fileOf(route.path));
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, route.html);
  }
};

// Down to its files, links and empty folders (`name/`), with `/` between names; a link is never entered.
const entriesOf = (folder: string, enters: (entry: string) => boolean = () => true, under = ''): string[] =>
  readdirSync(join(folder, under), { withFileTypes: true }).flatMap((found) => {
    const entry = under === '' ? found.name : `${under}/${found.name}`;
    if (!found.isDirectory()) return [entry];
    const inside = enters(entry) ? entriesOf(folder, enters, entry) : [];
    return inside.length > 0 ? inside : [`${entry}/`];
  });

const recordIn = (file: string): object => {
  try {
    const record: unknown = JSON.parse(readFileSync(file, 'utf8'));
    return record !== null && typeof record === 'object' && !Array.isArray(record) ? record : {};
  } catch {
    return {};
  }
};

// Written beside and renamed over, so a link at the record's own path is replaced, not written through.
const writeRecord = (file: string, record: object): string | undefined => {
  const next = `${file}.${randomUUID()}`;
  try {
    if (realOf(dirname(file)) !== dirname(file)) return 'a link is on the way to it';
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(next, `${JSON.stringify(record, null, 2)}\n`);
    renameSync(next, file);
    return undefined;
  } catch (error) {
    if (existsSync(next)) rmSync(next);
    return describe(error);
  }
};

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return codeOf(error) === 'EPERM';
  }
};

const removeEndedStages = (folder: string): void => {
  for (const name of readdirSync(folder)) {
    const pid = Number(name.slice(STAGE.length).split('-')[0]);
    if (name.startsWith(STAGE) && Number.isInteger(pid) && pid > 0 && !isRunning(pid) && lstatOf(join(folder, name))?.isDirectory() === true) rmSync(join(folder, name), { recursive: true });
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

const cacheOf = (root: string): string => join(realOf(root), 'node_modules', '.cache', 'nisc');

const replaceWritten = (root: string, out: string, folder: string, stage: string): string[] => {
  const file = join(cacheOf(root), 'exports.json');
  const record = recordIn(file);
  const recorded: unknown = Reflect.get(record, folder);
  const listed = (Array.isArray(recorded) ? recorded : []).flatMap((entry: unknown) => (typeof entry === 'string' ? [entry] : []));
  const written = entriesOf(stage);
  const listedSet = new Set(listed);
  const blocked = written.filter((entry) => {
    const path = join(folder, entry);
    return !entry.endsWith('/') && hasNoLinkOnTheWay(path) && lstatOf(path)?.isDirectory() === true && entriesOf(path).some((inside) => !listedSet.has(`${entry}/${inside}`));
  });
  if (blocked.length > 0) throw new Error(`nisc: a folder with files of its own stands where the export writes a file, in ${out}: ${blocked.join(', ')}. Nothing was written.`);
  const kept = Object.entries(record).filter(([other]) => other !== folder && existsSync(other));
  const unrecorded = writeRecord(file, Object.fromEntries([...kept, [folder, written]]));
  const notRemoved = removeListed(folder, listed);
  const files = written.filter((entry) => !entry.endsWith('/')).length;
  try {
    place(stage, folder);
  } catch (error) {
    const missing = entriesOf(stage).filter((entry) => !entry.endsWith('/')).length;
    throw new Error(
      `nisc: the export could not be moved into ${out} (${describe(error)}). ${files - missing} of its ${files} files are in place and ${missing} are not; the previous export's files are removed. Export again to finish.`,
    );
  }
  rmSync(stage, { recursive: true });
  const writtenSet = new Set(written);
  const writtenFolders = new Set(written.flatMap((entry) => entry.split('/').slice(0, -1).map((_name, at, names) => names.slice(0, at + 1).join('/'))));
  const left = entriesOf(folder, (entry) => writtenFolders.has(entry)).filter((entry) => !writtenSet.has(entry)).sort();
  return [
    ...(unrecorded === undefined ? [] : [`nisc: what this export wrote could not be recorded (${unrecorded}) in ${file}, so the next export into ${out} removes none of it.`]),
    ...(notRemoved.length > 0 ? [`nisc: not removed, as its real location is not inside ${out}: ${notRemoved.join(', ')}`] : []),
    ...(left.length > 0 ? [`nisc: left as they were in ${out}, not written by this export (${left.length}): ${left.slice(0, 5).join(', ')}${left.length > 5 ? ` and ${left.length - 5} more` : ''}`] : []),
  ];
};

// What the system answers when it will not make a file of that name, there.
const PATH_REFUSALS = new Set(['ENOENT', 'EINVAL', 'ENAMETOOLONG', 'EEXIST', 'ENOTDIR', 'EISDIR']);

const cannotWrite = (path: string, why: string): Error => new Error(`nisc: the path "${path}" cannot be written here (${why}). Nothing was written.`);

const notWritten = (out: string, error: unknown): Error => new Error(`nisc: the export could not be written into ${out} (${describe(error)}). Nothing already in it was changed.`);

// The export whole, in a fresh folder inside `parent`: what the system cannot make fails there, before anything already in `out` is touched.
const stageExport = (parent: string, out: string, dist: string, routes: readonly { path: string; html: string }[]): string => {
  const stage = join(parent, `${STAGE}${process.pid}-${randomUUID()}`);
  try {
    try {
      mkdirSync(parent, { recursive: true });
      removeEndedStages(parent);
      mkdirSync(stage);
      cpSync(dist, stage, { recursive: true });
    } catch (error) {
      throw notWritten(out, error);
    }
    for (const route of routes) {
      const file = join(stage, fileOf(route.path));
      if (!isWithin(stage, file)) throw cannotWrite(route.path, `its file would be outside ${out}`);
      try {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, route.html);
      } catch (error) {
        const code = codeOf(error);
        throw typeof code === 'string' && PATH_REFUSALS.has(code) ? cannotWrite(route.path, code) : notWritten(out, error);
      }
    }
    return stage;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }
};

// The fresh folder sits beside the export record, under node_modules, which git does not track. It only shows that every file can be made: out/ is emptied and copied from the build.
export const writeDefaultFolder = (root: string, out: string, dist: string, routes: readonly { path: string; html: string }[]): void => {
  rmSync(stageExport(cacheOf(root), out, dist, routes), { recursive: true, force: true, maxRetries: 3 });
  rmSync(out, { recursive: true, force: true });
  cpSync(dist, out, { recursive: true });
  writeRoutes(out, routes);
};

export const writeNamedFolder = (root: string, out: string, dist: string, routes: readonly { path: string; html: string }[]): string[] => {
  const folder = realOf(out);
  if (lstatOf(folder)?.isDirectory() === false) throw new Error(`nisc: --out ${out} is a file, not a folder. Nothing was written.`);
  mkdirSync(folder, { recursive: true });
  const stage = stageExport(folder, out, dist, routes);
  try {
    return replaceWritten(root, out, folder, stage);
  } catch (error) {
    throw isOwn(error) ? error : new Error(`nisc: the export could not be put into ${out} (${describe(error)}); part of it may be in place. Export again to finish.`);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
};
