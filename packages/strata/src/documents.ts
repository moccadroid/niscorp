import { prepare, orderPending, type PreparedMigration, type PreparedSequence } from './plan';
import type { DocumentKind, Sequence } from './schema';
import { StrataError } from './errors';

// ═══════════════════════════════════════════════════════════════
// Documents — the JSON a grammar describes, wherever it is kept.
//
// A document carries a STAMP: for each grammar sequence, how far along that
// sequence the writer was (`{ "nisc.nova": 3, "nisc.prism": 1 }`). Upgrading
// runs every document migration the stamp has not seen, in the ledger's order,
// and hands back the document with a current stamp. The same function serves a
// row read at boot, a submission at intake and a file in an app's source tree:
// the document does not care where it was kept.
//
// NESTING IS THE GRAMMAR'S, NOT THE MIGRATION'S. A kind declares where other
// documents sit inside it (its embeddings: nova's layout holds layouts at
// `children`, `children[]`, `then`, `else`, `do`; an action holds a layout and
// Prism configs). The walker finds every document of a step's kind at any
// depth and rewrites each on its own, deepest first. A transform only ever sees
// ONE node — so migrations stay flat, and a Prism config can express them
// without recursion of its own.
// ═══════════════════════════════════════════════════════════════

export type Stamp = Readonly<Record<string, number>>;

// Where a document sits: the path from the root (keys and indexes) and its kind.
export type Location = { path: readonly (string | number)[]; kind: string; value: Record<string, unknown> };

// The injected evaluator — nova's `transform` socket, the same shape: under moss
// it is Prism's `evaluate`, and a migration runs exactly the way an endpoint does.
export type Transform = (config: unknown, source: unknown) => unknown;

export type UpgradeResult = {
  document: Record<string, unknown>;
  // What to store with the document: current on every grammar the upgrader was
  // given, and the document's entries for any other grammar kept as they were.
  stamp: Stamp;
  // What ran, in order — empty when the document was already current.
  applied: readonly string[];
};

export type Upgrader = {
  // The stamp a document written NOW carries.
  stamp: Stamp;
  upgrade: (document: unknown, options: { kind: string; stamp?: Stamp | null }) => UpgradeResult;
  // Every document inside `document` (itself included), by kind — what the
  // walker sees. For a page that shows it, and for a check that asserts it.
  locate: (document: unknown, kind: string) => Location[];
  // Is a document at this stamp behind the code (true), current (false)? Throws
  // TOO_NEW if it is ahead.
  behind: (stamp: Stamp | null | undefined) => boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const pathText = (path: readonly (string | number)[]): string =>
  path.reduce<string>((text, key) => (typeof key === 'number' ? `${text}[${key}]` : text === '' ? key : `${text}.${key}`), '');

// One embedding pattern, applied to one value: every (relative path, value)
// the pattern reaches. `key` descends, `*` crosses a record's values, and a
// `[]` suffix crosses the array found there.
const reach = (value: unknown, pattern: string): { path: (string | number)[]; value: unknown }[] => {
  let frontier: { path: (string | number)[]; value: unknown }[] = [{ path: [], value }];
  for (const segment of pattern.split('.')) {
    const array = segment.endsWith('[]');
    const key = array ? segment.slice(0, -2) : segment;
    const next: { path: (string | number)[]; value: unknown }[] = [];
    for (const at of frontier) {
      if (!isRecord(at.value)) continue;
      const found: { path: (string | number)[]; value: unknown }[] =
        key === '*'
          ? Object.entries(at.value).map(([k, v]) => ({ path: [...at.path, k], value: v }))
          : key in at.value
            ? [{ path: [...at.path, key], value: at.value[key] }]
            : [];
      for (const f of found) {
        if (!array) next.push(f);
        else if (Array.isArray(f.value)) f.value.forEach((item, i) => next.push({ path: [...f.path, i], value: item }));
      }
    }
    frontier = next;
  }
  return frontier;
};

const getAt = (root: unknown, path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>((at, key) => {
    if (typeof key === 'number') return Array.isArray(at) ? at[key] : undefined;
    return isRecord(at) ? at[key] : undefined;
  }, root);

const setAt = (root: unknown, path: readonly (string | number)[], value: unknown): unknown => {
  const [head, ...rest] = path;
  if (head === undefined) return value;
  if (typeof head === 'number' && Array.isArray(root)) return root.map((item, i) => (i === head ? setAt(item, rest, value) : item));
  if (typeof head === 'string' && isRecord(root)) return { ...root, [head]: setAt(root[head], rest, value) };
  return root;
};

export const createUpgrader = async (sequences: readonly Sequence[], options: { transform: Transform }): Promise<Upgrader> => {
  const prepared = await prepare(sequences);
  const tables = prepared.filter((s) => !s.grammar);
  if (tables.length > 0) {
    // A sequence is read as a grammar by what it declares (plan.ts). One with
    // nothing but markers and no `documents` reads as owning tables, so the
    // refusal says how a grammar says it is one — `migrate` alone would send a
    // kit's markers to a database's ledger.
    throw new StrataError(
      'WRONG_OWNER',
      'Documents are upgraded by grammar sequences; these own tables and belong to a database\'s ledger (`migrate`). If one of them is a grammar, declare its `documents` — a sequence with no `documents` and no document step is read as owning tables.',
      tables.map((s) => s.id),
    );
  }
  const grammars: readonly PreparedSequence[] = prepared;

  const kinds = new Map<string, DocumentKind>();
  for (const sequence of grammars) {
    for (const [name, kind] of Object.entries(sequence.documents)) kinds.set(`${sequence.id}/${name}`, kind);
  }
  const unknown = [
    ...grammars.flatMap((s) => s.migrations.flatMap((m) => m.steps.flatMap((step) => (step.kind === 'document' && !kinds.has(step.at) ? [`${m.ref} rewrites ${step.at}`] : [])))),
    ...[...kinds].flatMap(([ref, kind]) => Object.entries(kind.embeds ?? {}).flatMap(([path, target]) => (kinds.has(target) ? [] : [`${ref} embeds ${target} at ${path}`]))),
  ];
  if (unknown.length > 0) throw new StrataError('UNKNOWN_KIND', 'A document kind is named that no sequence declares.', unknown);

  const stamp: Stamp = Object.fromEntries(grammars.map((s) => [s.id, s.migrations.length]));

  // The stamp a document carries once this code has read it: this code's
  // position on every grammar it was given and — as they were — the document's
  // own entries for grammars it was not. Those record code this reader lacks (a
  // kit it does not have); dropping them would let code that does have the
  // grammar run its migrations over the document a second time.
  const ownIds = new Set(grammars.map((s) => s.id));
  const stampAfter = (given: Stamp | null | undefined): Stamp => {
    const others = Object.entries(given ?? {}).filter(([id]) => !ownIds.has(id));
    return others.length === 0 ? stamp : { ...stamp, ...Object.fromEntries(others) };
  };

  const locate = (document: unknown, kind: string): Location[] => {
    if (!kinds.has(kind)) throw new StrataError('UNKNOWN_KIND', `No sequence declares the document kind "${kind}".`, [...kinds.keys()]);
    const found: Location[] = [];
    const visit = (value: unknown, at: string, path: (string | number)[]): void => {
      if (!isRecord(value)) return;
      found.push({ path, kind: at, value });
      for (const [pattern, target] of Object.entries(kinds.get(at)?.embeds ?? {})) {
        for (const hit of reach(value, pattern)) visit(hit.value, target, [...path, ...hit.path]);
      }
    };
    visit(document, kind, []);
    return found;
  };

  const positionOf = (given: Stamp | null | undefined, id: string): number => given?.[id] ?? 0;

  const behind = (given: Stamp | null | undefined): boolean => {
    const ahead = grammars.filter((s) => positionOf(given, s.id) > s.migrations.length);
    if (ahead.length > 0) {
      throw new StrataError(
        'TOO_NEW',
        'This document was written by newer code than this — reading it would be guessing.',
        ahead.map((s) => `${s.id}: the document is at ${positionOf(given, s.id)}, this code knows ${s.migrations.length}`),
      );
    }
    return grammars.some((s) => positionOf(given, s.id) < s.migrations.length);
  };

  const upgrade = (document: unknown, { kind, stamp: given }: { kind: string; stamp?: Stamp | null }): UpgradeResult => {
    if (!isRecord(document)) throw new StrataError('STEP_FAILED', `A ${kind} document must be a JSON object.`);
    if (!kinds.has(kind)) throw new StrataError('UNKNOWN_KIND', `No sequence declares the document kind "${kind}".`, [...kinds.keys()]);
    if (!behind(given)) return { document, stamp: stampAfter(given), applied: [] };

    // What this document has seen: everything up to its stamp, per sequence.
    // A sequence it has never heard of starts at 0 — a document written before
    // a grammar existed simply has none of its migrations yet.
    const done = new Set(grammars.flatMap((s) => s.migrations.filter((m) => m.n <= positionOf(given, s.id)).map((m) => m.ref)));
    const { pending, stuck } = orderPending(
      grammars.map((s) => ({ waiting: s.migrations.filter((m) => !done.has(m.ref)) })),
      done,
    );
    if (stuck.length > 0) throw new StrataError('CYCLE', 'Document migrations wait on each other and can never run.', stuck.map((m) => m.ref));

    let current: Record<string, unknown> = document;
    const applied: string[] = [];
    const runStep = (migration: PreparedMigration, at: string, transform: unknown): void => {
      // Deepest first: a parent's rewrite sees its children already rewritten,
      // and replacing a child never moves the path to its parent.
      const targets = locate(current, kind)
        .filter((l) => l.kind === at)
        .sort((a, b) => b.path.length - a.path.length);
      for (const target of targets) {
        // The value NOW, not when the targets were found: a child rewritten a
        // moment ago lives in `current`, and the parent must see — and keep — it.
        const value = getAt(current, target.path);
        let rewritten: unknown;
        try {
          rewritten = options.transform(transform, { document: value, path: pathText(target.path) });
        } catch (cause) {
          throw new StrataError(
            'STEP_FAILED',
            `${migration.ref} ("${migration.description}") failed on the ${at} at ${pathText(target.path) || '(root)'}.`,
            [cause instanceof Error ? cause.message : String(cause)],
            { cause },
          );
        }
        if (!isRecord(rewritten)) {
          throw new StrataError('STEP_FAILED', `${migration.ref} turned the ${at} at ${pathText(target.path) || '(root)'} into something that is not a document.`, [
            JSON.stringify(rewritten)?.slice(0, 200) ?? String(rewritten),
          ]);
        }
        const next = setAt(current, target.path, rewritten);
        if (isRecord(next)) current = next;
      }
    };
    for (const migration of pending) {
      for (const step of migration.steps) if (step.kind === 'document') runStep(migration, step.at, step.transform);
      applied.push(migration.ref);
    }
    return { document: current, stamp: stampAfter(given), applied };
  };

  return { stamp, upgrade, locate, behind };
};
