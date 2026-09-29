import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { CHECKS } from '@lyceum/dev/suite';

// HOW BIG THIS APP IS — counted from its own source, so the slide that says it
// can never go stale. A line counts when it holds code: comments and blank
// lines do not, and this codebase comments heavily, so counting them would
// measure the prose. TypeScript's own scanner decides what is a comment — a
// `//` inside a string is not one.
//
// `data` is app/: the authored artifacts, each parsing its schema
// (artifacts-check). `code` is everything else the app runs: the kits (ui/),
// the server (server/), the tables and seed (db/), the terminal entry. The
// checks (dev/) are counted apart. Counted once per server — boot makes one
// counter and hands it to the room's functions (./boot.ts): the source does not
// change under a running server.

export type Census = { data: number; code: number; share: number; checks: number; checkLines: number };

const SRC = fileURLToPath(new URL('..', import.meta.url));

const codeLines = (text: string): number => {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const starts = [0, ...[...text.matchAll(/\n/g)].map((match) => match.index + 1)];
  const lineOf = (position: number): number => starts.filter((start) => start <= position).length - 1;
  const lines = new Set<number>();
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.WhitespaceTrivia || token === ts.SyntaxKind.NewLineTrivia || token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) continue;
    for (let line = lineOf(scanner.getTokenStart()); line <= lineOf(scanner.getTokenEnd()); line += 1) lines.add(line);
  }
  return lines.size;
};

const linesOf = async (files: readonly string[]): Promise<number> => {
  const counts = await Promise.all(files.map(async (file) => codeLines(await readFile(file, 'utf8'))));
  return counts.reduce((sum, count) => sum + count, 0);
};

const filesUnder = async (folder: string): Promise<string[]> => {
  const entries = await readdir(join(SRC, folder), { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name)).map((entry) => join(entry.parentPath, entry.name));
};

const count = async (): Promise<Census> => {
  const [app, ui, server, db, dev] = await Promise.all(['app', 'ui', 'server', 'db', 'dev'].map(filesUnder));
  const [data, code, checkLines] = await Promise.all([
    linesOf(app ?? []),
    linesOf([...(ui ?? []), ...(server ?? []), ...(db ?? []), join(SRC, 'main.ts')]),
    linesOf(dev ?? []),
  ]);
  return { data, code, share: Math.round((100 * data) / (data + code)), checks: CHECKS.length, checkLines };
};

// A counter that counts on its first call and answers the same after.
export const createCensus = (): (() => Promise<Census>) => {
  let counted: Promise<Census> | undefined;
  return () => {
    counted ??= count();
    return counted;
  };
};
