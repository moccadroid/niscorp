import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { appDataFindings } from './app-data';
import { sourceFindings } from './source';
import type { Finding } from './source';
import { loadTypeScript } from './typescript';

export type ShapeRule = 'style' | 'formatting' | 'roles' | 'files' | 'address' | 'dom' | 'data';

export type ShapeAction = { id: string; endpoints?: Readonly<Record<string, unknown>> };

export type ShapeEntry = { fingerprint: string; refresh?: string; dsl?: unknown; mapping?: unknown };

export type ShapeCheckConfig = {
  root: string;
  actions: readonly ShapeAction[];
  entries?: readonly ShapeEntry[];
  functions?: Readonly<Record<string, string>>;
  allow?: Readonly<Partial<Record<ShapeRule, Readonly<Record<string, string>>>>>;
  log?: (line: string) => void;
};

const RULES: readonly (readonly [rule: ShapeRule, what: string])[] = [
  ['style', 'rule 16: no assertion but "as const", no non-null "!", no function declaration, class, enum, "any" or default export in src/'],
  ['formatting', 'rule 9: no Intl and no toLocale… outside Prism (src/, but src/dev/)'],
  ['roles', 'rule 11: no server code reads the caller’s roles (src/server/)'],
  ['files', 'rule 9a: the kit reads no file into data (src/ui/)'],
  ['address', 'rule 4: the kit neither reads nor changes the address (src/ui/)'],
  ['dom', 'rule 2: no component finds elements in the document (src/ui/)'],
  ['data', 'src/app is data: no code outside it calls a function of it, but the manifest’s factory'],
];

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const endpointsOf = (actions: readonly ShapeAction[]): { action: string; endpoint: Record<string, unknown> }[] =>
  actions.flatMap((action) => Object.values(action.endpoints ?? {}).flatMap((endpoint) => (isRecord(endpoint) ? [{ action: action.id, endpoint }] : [])));

const replayOf = (endpoint: Record<string, unknown>): { fingerprint?: string } | undefined => {
  const request = endpoint['request'];
  if (!isRecord(request) || !('fingerprint' in request)) return undefined;
  const fingerprint = request['fingerprint'];
  return typeof fingerprint === 'string' ? { fingerprint } : {};
};

export const runShapeCheck = (config: ShapeCheckConfig): number => {
  const log = config.log ?? ((line: string) => console.log(line));
  let failures = 0;
  const check = (what: string, passed: boolean, detail: readonly string[] = []): void => {
    log(`${passed ? '[pass]' : '[fail]'} ${what}${passed || detail.length === 0 ? '' : ` — ${detail.join('; ')}`}`);
    if (!passed) failures += 1;
  };
  const done = (): number => {
    log(failures === 0 ? '[pass] shape: all checks passed' : `[fail] shape: ${failures} check(s) failed`);
    return failures === 0 ? 0 : 1;
  };

  let findings: Finding[];
  try {
    const ts = loadTypeScript(config.root);
    findings = [...sourceFindings(ts, config.root), ...appDataFindings(ts, config.root)];
  } catch (error) {
    check('the source is read', false, [error instanceof Error ? error.message : String(error)]);
    return done();
  }

  const allow = config.allow ?? {};
  for (const [rule, what] of RULES) {
    const allowed = allow[rule] ?? {};
    const left = findings.filter((finding) => finding.rule === rule && allowed[finding.file] === undefined);
    check(what, left.length === 0, left.map((finding) => `${finding.file}:${finding.line} ${finding.what}`));
  }
  const idle = RULES.flatMap(([rule]) =>
    Object.entries(allow[rule] ?? {}).flatMap(([file, reason]) => {
      if (reason.trim() === '') return [`${rule}: ${file} gives no reason`];
      if (!existsSync(join(config.root, file))) return [`${rule}: ${file} does not exist`];
      return findings.some((finding) => finding.rule === rule && finding.file === file) ? [] : [`${rule}: ${file} has nothing to allow`];
    }),
  );
  check('every allowance names a file there is, why, and something it allows', idle.length === 0, idle);

  const endpoints = endpointsOf(config.actions);
  const ledger = config.functions ?? {};
  const called = new Set(endpoints.flatMap(({ endpoint }) => (typeof endpoint['fn'] === 'string' ? [endpoint['fn']] : [])));
  const unexplained = [...called].filter((id) => (ledger[id] ?? '').trim() === '').sort();
  check('every server function an action calls is named in `functions`, with what it does that a vex read or write cannot', unexplained.length === 0, unexplained);
  const uncalled = Object.keys(ledger).filter((id) => !called.has(id)).sort();
  check('every function named in `functions` is called by an action', uncalled.length === 0, uncalled);

  const replays = endpoints.flatMap(({ endpoint }) => {
    const replay = replayOf(endpoint);
    return replay === undefined ? [] : [replay];
  });
  const named = new Set(replays.flatMap((replay) => (replay.fingerprint === undefined ? [] : [replay.fingerprint])));
  const reads = (config.entries ?? []).filter((entry) => entry.dsl !== undefined);
  const calls = endpoints.filter(({ endpoint }) => typeof endpoint['fn'] === 'string').length;
  log(`[info] actions call server functions ${calls} times and replay vex ${replays.length} times`);
  log(`[info] ${reads.filter((entry) => entry.mapping !== undefined).length} of ${reads.length} reads word their rows with a Prism mapping`);
  const unnamed = reads.filter((entry) => entry.refresh === 'reactive' && !named.has(entry.fingerprint)).map((entry) => entry.fingerprint);
  if (unnamed.length > 0) log(`[info] reactive reads no action replays by name: ${unnamed.join(', ')}`);
  return done();
};
