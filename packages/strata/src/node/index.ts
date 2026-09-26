import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createUpgrader, type Stamp, type Transform } from '../documents';
import type { Sequence } from '../schema';
import type { GrammarSchema } from '../check';
import { changedStrings, planSourceUpgrade, renderReport, verifySourceUpgrade, type SourceDocument, type SourcePlan } from '../upgrade';
import { StrataError } from '../errors';

// ═══════════════════════════════════════════════════════════════
// @niscorp/strata/node — `strata upgrade` for an app's source.
//
// An app runs this from a script of its own (it knows how to list its
// artifacts; strata does not), e.g. `src/dev/strata.ts`:
//
//   process.exit(await runSourceUpgrade({ root, grammars, transform, documents }, process.argv.slice(2)));
//
//   status [--check]  where the source stands against the installed grammars
//   init              record that the source is written at the CURRENT grammars
//   upgrade           plan: expected JSON + REPORT.md in .strata/upgrade/
//   verify            the edited source against the plan; moves the lock
//
// The lock — strata.lock.json, committed — is the source's stamp: which
// version of every grammar its artifacts are written in. It moves only when
// verify passes.
// ═══════════════════════════════════════════════════════════════

export type SourceUpgradeOptions = {
  root: string;
  grammars: readonly Sequence[];
  transform: Transform;
  documents: () => readonly SourceDocument[] | Promise<readonly SourceDocument[]>;
  schemas?: Readonly<Record<string, GrammarSchema>>;
  lock?: string;
  workDir?: string;
  // Where to look for the file an artifact is written in (default "src").
  sources?: string;
  log?: (line: string) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

const stampText = (s: Stamp): string => Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ') || '(nothing)';

const filesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (name === 'node_modules' || name.startsWith('.')) return [];
        return statSync(path).isDirectory() ? filesUnder(path) : /\.(ts|tsx|js|mjs)$/.test(name) ? [path] : [];
      })
    : [];

export const runSourceUpgrade = async (options: SourceUpgradeOptions, argv: readonly string[]): Promise<number> => {
  const log = options.log ?? ((line: string) => console.log(line));
  const command = argv.find((a) => !a.startsWith('-')) ?? 'status';
  const lockPath = join(options.root, options.lock ?? 'strata.lock.json');
  const work = join(options.root, options.workDir ?? join('.strata', 'upgrade'));
  const rel = (path: string): string => relative(options.root, path);

  const upgrader = await createUpgrader(options.grammars, { transform: options.transform });
  const descriptions = new Map<string, string>(options.grammars.flatMap((g) => g.migrations.map((m, i): [string, string] => [`${g.id}/${i + 1}`, m.description])));

  const readLock = (): Stamp | undefined => {
    if (!existsSync(lockPath)) return undefined;
    const raw: unknown = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (!isRecord(raw) || !isRecord(raw['grammar'])) throw new StrataError('INVALID_SEQUENCE', `${rel(lockPath)} is not a lock: expected { "grammar": { … } }.`);
    return Object.fromEntries(Object.entries(raw['grammar']).map(([k, v]) => [k, Number(v)]));
  };
  const writeLock = (stamp: Stamp): void =>
    writeFileSync(lockPath, `${JSON.stringify({ grammar: Object.fromEntries(Object.entries(stamp).sort(([a], [b]) => (a < b ? -1 : 1))) }, null, 2)}\n`);

  const sourceText = (): Map<string, string> => new Map(filesUnder(join(options.root, options.sources ?? 'src')).map((f) => [f, readFileSync(f, 'utf8')]));

  const loadDocuments = async (): Promise<SourceDocument[]> => {
    const text = sourceText();
    const fileOf = (id: string): string | undefined => {
      const needles = [`id: '${id}'`, `id: "${id}"`, `"id": "${id}"`];
      for (const [path, body] of text) if (needles.some((n) => body.includes(n))) return rel(path);
      return undefined;
    };
    return (await options.documents()).map((d) => {
      // Pure JSON, as it would be stored: no undefined, no functions.
      const document: unknown = JSON.parse(JSON.stringify(d.document));
      const file = d.file ?? fileOf(d.id);
      return { kind: d.kind, id: d.id, document, ...(file === undefined ? {} : { file }) };
    });
  };

  const lock = readLock();

  if (command === 'init') {
    if (lock !== undefined) {
      log(`[fail] ${rel(lockPath)} already records ${stampText(lock)} — init only records a source that has never had a lock.`);
      return 1;
    }
    writeLock(upgrader.stamp);
    log(`[pass] recorded: the source is written at ${stampText(upgrader.stamp)} (${rel(lockPath)}). Only true if it is — commit it.`);
    return 0;
  }

  if (lock === undefined) {
    log(`[fail] no ${rel(lockPath)} — nothing records which grammars this source is written in.`);
    log(`       If it is written at the installed ones (${stampText(upgrader.stamp)}), run: strata init`);
    return 1;
  }

  let behind: boolean;
  try {
    behind = upgrader.behind(lock);
  } catch (error) {
    log(`[fail] ${error instanceof Error ? error.message.split('\n').join('\n       ') : String(error)}`);
    log('       The lock is ahead of the installed grammars — install the newer packages, or the lock is wrong.');
    return 1;
  }

  if (command === 'status') {
    if (!behind) {
      log(`[pass] the source is written at the installed grammars (${stampText(lock)})`);
      return 0;
    }
    log(`[${argv.includes('--check') ? 'fail' : 'info'}] the source is written at ${stampText(lock)}; the installed grammars are at ${stampText(upgrader.stamp)}.`);
    log('       Run: strata upgrade — then edit what REPORT.md lists — then: strata verify');
    return argv.includes('--check') ? 1 : 0;
  }

  if (command === 'upgrade') {
    if (!behind) {
      log(`[pass] nothing to upgrade — the source is written at the installed grammars (${stampText(lock)})`);
      return 0;
    }
    const documents = await loadDocuments();
    const drafted = await planSourceUpgrade({
      upgrader,
      stamp: lock,
      documents,
      ...(options.schemas === undefined ? {} : { schemas: options.schemas }),
      describe: (ref) => descriptions.get(ref) ?? '(no description)',
    });
    // Where each change is written: the files holding the values it rewrites.
    const text = sourceText();
    const byKey = new Map(documents.map((d) => [`${d.kind}:${d.id}`, d]));
    const plan: SourcePlan = {
      ...drafted,
      documents: drafted.documents.map((doc) => {
        const needles = changedStrings(byKey.get(`${doc.kind}:${doc.id}`)?.document, doc.expected).flatMap((s) => [`'${s}'`, `"${s}"`]);
        const lookIn = [...text].filter(([, body]) => needles.some((n) => body.includes(n))).map(([path]) => rel(path));
        return { ...doc, lookIn };
      }),
    };
    rmSync(work, { recursive: true, force: true });
    mkdirSync(work, { recursive: true });
    const expectedPathOf = (doc: { kind: string; id: string }): string => join(work, 'expected', doc.kind.replace(/[^a-z0-9.-]/gi, '_'), `${doc.id.replace(/[^A-Za-z0-9._-]/g, '_')}.json`);
    for (const doc of plan.documents) {
      const path = expectedPathOf(doc);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, `${JSON.stringify(doc.expected, null, 2)}\n`);
    }
    writeFileSync(join(work, 'plan.json'), `${JSON.stringify(plan, null, 2)}\n`);
    writeFileSync(join(work, 'REPORT.md'), `${renderReport(plan, (d) => rel(expectedPathOf(d)))}\n`);
    log(`[plan] ${stampText(plan.from)} → ${stampText(plan.to)}: ${plan.migrations.length} migration(s)`);
    for (const m of plan.migrations) log(`       ${m.ref}  ${m.description}`);
    log(`       ${plan.documents.length} artifact(s) to edit, ${plan.untouched.length} untouched.`);
    for (const d of plan.documents) log(`       ${d.file ?? '(file not found)'}  ${d.id}`);
    log(`       Report: ${rel(join(work, 'REPORT.md'))} — edit, then: strata verify`);
    for (const p of plan.problems) log(`[fail] ${p}`);
    return plan.problems.length > 0 ? 1 : 0;
  }

  if (command === 'verify') {
    const planPath = join(work, 'plan.json');
    if (!existsSync(planPath)) {
      log(`[fail] no plan at ${rel(planPath)} — run: strata upgrade`);
      return 1;
    }
    const raw: unknown = JSON.parse(readFileSync(planPath, 'utf8'));
    if (!isRecord(raw) || !isRecord(raw['to']) || !isRecord(raw['from']) || !Array.isArray(raw['documents']) || !Array.isArray(raw['untouched'])) {
      log(`[fail] ${rel(planPath)} is not a plan — run: strata upgrade`);
      return 1;
    }
    // The plan was made by strata and read back as it wrote it.
    const plan: SourcePlan = {
      from: Object.fromEntries(Object.entries(raw['from']).map(([k, v]) => [k, Number(v)])),
      to: Object.fromEntries(Object.entries(raw['to']).map(([k, v]) => [k, Number(v)])),
      migrations: [],
      documents: raw['documents'].flatMap((d: unknown) =>
        isRecord(d) && typeof d['kind'] === 'string' && typeof d['id'] === 'string' ? [{ kind: d['kind'], id: d['id'], applied: [], changes: [], expected: d['expected'] }] : [],
      ),
      untouched: raw['untouched'].map(String),
      problems: [],
    };
    if (JSON.stringify(plan.to) !== JSON.stringify(upgrader.stamp)) {
      log(`[fail] the plan was made for ${stampText(plan.to)}, but the installed grammars are at ${stampText(upgrader.stamp)} — plan again: strata upgrade`);
      return 1;
    }
    const result = verifySourceUpgrade({ plan, upgrader, documents: await loadDocuments() });
    for (const line of result.lines) {
      log(`[${line.ok ? 'pass' : 'fail'}] ${line.text}`);
      for (const d of line.detail ?? []) log(`         ${d}`);
    }
    if (!result.ok) return 1;
    writeLock(plan.to);
    rmSync(join(options.root, options.workDir ?? '.strata'), { recursive: true, force: true });
    log(`[pass] the source is now written at ${stampText(plan.to)} — ${rel(lockPath)} updated. Commit it with the edits.`);
    return 0;
  }

  log(`[fail] unknown command "${command}" — status [--check] | init | upgrade | verify`);
  return 1;
};
