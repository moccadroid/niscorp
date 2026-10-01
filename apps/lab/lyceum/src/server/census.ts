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
// `data` is app/ — the authored artifacts, each parsing its schema
// (artifacts-check) — and the three data files that live beside the code that
// uses them: the deck (db/deck.ts), the words names are made of (db/names.ts),
// and the kit's props schema (ui/kit.props.ts). The code is counted by the place it lives, the way the
// talk names them: the RENDERER (ui/ — the kit that draws the app: nova's DOM
// adapter's), ENDPOINTS (what an
// action calls: server/functions/, the assistant, and the model calls behind
// them), SETUP (everything else that boots and serves: the rest of server/,
// the tables and seed in db/, the terminal entry). The checks (dev/) are
// counted apart — and so are the OTHER RENDERERS: the React, Vue, terminal and
// text kits draw the same screens again, for the talk's demos. An app ships
// one renderer, so one is what the share is counted against; the others are
// shown beside it, not hidden. Counted once per server — boot makes one counter and hands
// it to the room's functions (./boot.ts): the source does not change under a
// running server.

export type Census = { data: number; renderers: number; otherRenderers: number; endpoints: number; setup: number; code: number; share: number; checks: number; checkLines: number };

// Data that lives outside app/, each a file of data and nothing else.
const DATA_FILES = ['db/deck.ts', 'db/names.ts', 'ui/kit.props.ts'];

// The kits that draw the app a second, third… time, for the demos.
const OTHER_KITS = ['react.kit.ts', 'vue.kit.ts', 'ink.kit.ts', 'text.kit.ts'];

// The model calls an endpoint makes, which live beside the server's setup.
const ENDPOINT_FILES = ['querying.ts', 'timing.ts', 'moderation.ts', 'decider.ts'];

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
  const inServer = (file: string): string => file.slice(join(SRC, 'server').length + 1).replaceAll('\\', '/');
  const isEndpoint = (file: string): boolean => /^(functions|assistant)\//.test(inServer(file)) || ENDPOINT_FILES.includes(inServer(file));
  const isData = (file: string): boolean => DATA_FILES.some((data) => file.replaceAll('\\', '/').endsWith(`/${data}`));
  const isOtherKit = (file: string): boolean => OTHER_KITS.some((kit) => file.replaceAll('\\', '/').endsWith(`/ui/${kit}`));
  const [data, renderers, otherRenderers, endpoints, setup, checkLines] = await Promise.all([
    linesOf([...(app ?? []), ...[...(ui ?? []), ...(db ?? [])].filter(isData)]),
    linesOf((ui ?? []).filter((file) => !isOtherKit(file) && !isData(file))),
    linesOf((ui ?? []).filter(isOtherKit)),
    linesOf((server ?? []).filter(isEndpoint)),
    linesOf([...(server ?? []).filter((file) => !isEndpoint(file)), ...(db ?? []).filter((file) => !isData(file)), join(SRC, 'main.ts')]),
    linesOf(dev ?? []),
  ]);
  const code = renderers + endpoints + setup;
  return { data, renderers, otherRenderers, endpoints, setup, code, share: Math.round((100 * data) / (data + code)), checks: CHECKS.length, checkLines };
};

// A counter that counts on its first call and answers the same after.
export const createCensus = (): (() => Promise<Census>) => {
  let counted: Promise<Census> | undefined;
  return () => {
    counted ??= count();
    return counted;
  };
};
