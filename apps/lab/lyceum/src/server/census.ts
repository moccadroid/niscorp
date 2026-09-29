import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS } from '@lyceum/dev/suite';

// HOW BIG THIS APP IS — counted from its own source, so the slide that says it
// can never go stale. Lines of TypeScript per folder, the way `wc -l` counts
// them (newlines), and the checks in the suite. Counted once per server — boot
// makes one counter and hands it to the room's functions (./boot.ts): the
// source does not change under a running server.

export type Census = { app: number; ui: number; server: number; dev: number; checks: number };

const SRC = fileURLToPath(new URL('..', import.meta.url));

const linesUnder = async (folder: string): Promise<number> => {
  const entries = await readdir(join(SRC, folder), { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.ts')).map((entry) => join(entry.parentPath, entry.name));
  const counts = await Promise.all(files.map(async (file) => (await readFile(file, 'utf8')).split('\n').length - 1));
  return counts.reduce((sum, count) => sum + count, 0);
};

const count = async (): Promise<Census> => {
  const [app, ui, server, dev] = await Promise.all(['app', 'ui', 'server', 'dev'].map(linesUnder));
  return { app: app ?? 0, ui: ui ?? 0, server: server ?? 0, dev: dev ?? 0, checks: CHECKS.length };
};

// A counter that counts on its first call and answers the same after.
export const createCensus = (): (() => Promise<Census>) => {
  let counted: Promise<Census> | undefined;
  return () => {
    counted ??= count();
    return counted;
  };
};
