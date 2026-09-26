import type { Stamp, Upgrader } from '../documents';
import { diffJson, type GrammarSchema } from '../check';
import { StrataError } from '../errors';

// ═══════════════════════════════════════════════════════════════
// @niscorp/strata/upgrade — artifacts in an app's SOURCE, brought forward.
//
// Rows and submissions are upgraded where they are read. Source files are
// different: they are TypeScript, written by people, and rewriting them by
// machine means a codemod that would have to understand every way a person
// can write an object. So strata does not edit them. It works out, from the
// migrations, EXACTLY what each artifact must become — and then checks that
// whoever did the editing (a person, an agent) landed on it, byte for byte.
//
//   plan    the lock says the source is written at stamp S; the installed
//           grammars are ahead. Every artifact is upgraded from S: the ones
//           that change get their expected JSON and a diff; the rest are noted.
//   (edit)  anyone — the report says which artifact, which migration, what
//           changes, and where the expected JSON is.
//   verify  the edited source, read again: every planned artifact equals its
//           expected JSON; every other one is still one no migration touches.
//           Then — and only then — the lock moves.
//
// Pure: documents in, plans out. `@niscorp/strata/node` does the files.
// ═══════════════════════════════════════════════════════════════

export type SourceDocument = { kind: string; id: string; document: unknown; file?: string };

export type PlannedDocument = {
  kind: string;
  id: string;
  file?: string;
  // Files that contain what changes — the artifact's own file names only where
  // its id is written; the layout it imports is often where the edit goes.
  lookIn?: readonly string[];
  applied: readonly string[];
  changes: readonly string[];
  expected: unknown;
};

export type SourcePlan = {
  from: Stamp;
  to: Stamp;
  migrations: readonly { ref: string; description: string }[];
  // Artifacts the migrations change — the whole to-do list.
  documents: readonly PlannedDocument[];
  // Artifacts no pending migration touches (by kind:id) — verify checks they stay that way.
  untouched: readonly string[];
  // An expected document that does not pass its kind's current schema: the
  // MIGRATION is wrong, and no edit could make verify pass. Fix it first.
  problems: readonly string[];
};

const keyOf = (doc: { kind: string; id: string }): string => `${doc.kind}:${doc.id}`;

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => [k, sortKeys(v)]));
};
// Equal as JSON: key order is how a person happened to write the object, not content.
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

// The string values a migration removes or rewrites — what to search the
// source for to find where an edit goes.
export const changedStrings = (before: unknown, after: unknown): string[] => {
  const found = new Set<string>();
  const visit = (a: unknown, b: unknown): void => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (typeof a === 'string') {
      found.add(a);
      return;
    }
    if (Array.isArray(a)) {
      a.forEach((item, i) => visit(item, Array.isArray(b) ? b[i] : undefined));
      return;
    }
    if (typeof a === 'object' && a !== null) {
      for (const [k, v] of Object.entries(a)) visit(v, typeof b === 'object' && b !== null && !Array.isArray(b) ? Reflect.get(b, k) : undefined);
    }
  };
  visit(before, after);
  return [...found].filter((s) => s.length >= 4);
};

export const planSourceUpgrade = async (options: {
  upgrader: Upgrader;
  stamp: Stamp;
  documents: readonly SourceDocument[];
  schemas?: Readonly<Record<string, GrammarSchema>>;
  // Every migration the upgrader would run from `stamp`, for the report — the
  // host passes the grammar sequences' descriptions.
  describe: (ref: string) => string;
}): Promise<SourcePlan> => {
  const { upgrader, stamp, documents, schemas, describe } = options;
  const seen = new Set<string>();
  const planned: PlannedDocument[] = [];
  const untouched: string[] = [];
  const problems: string[] = [];

  for (const doc of documents) {
    const key = keyOf(doc);
    if (seen.has(key)) throw new StrataError('INVALID_SEQUENCE', `Two artifacts are both ${key} — an artifact needs one identity to be planned.`);
    seen.add(key);
    const result = upgrader.upgrade(doc.document, { kind: doc.kind, stamp });
    if (sameJson(result.document, doc.document)) {
      untouched.push(key);
      continue;
    }
    planned.push({
      kind: doc.kind,
      id: doc.id,
      ...(doc.file === undefined ? {} : { file: doc.file }),
      applied: result.applied,
      changes: diffJson(doc.document, result.document),
      expected: result.document,
    });
    const schema = schemas?.[doc.kind];
    if (schema !== undefined) {
      const checked = await schema['~standard'].validate(result.document);
      if (checked.issues !== undefined) {
        problems.push(`${key}: the migrated artifact does not pass ${doc.kind}'s current schema — ${checked.issues.slice(0, 2).map((i) => i.message).join('; ')}`);
      }
    }
  }

  // Every migration between the lock and the installed grammars — markers
  // included, which change no artifact but still move the version.
  const from = stamp;
  const to = upgrader.stamp;
  const migrations = Object.entries(to).flatMap(([id, n]) =>
    Array.from({ length: Math.max(0, n - (from[id] ?? 0)) }, (_, i) => `${id}/${(from[id] ?? 0) + i + 1}`),
  );
  return {
    from,
    to,
    migrations: migrations.map((ref) => ({ ref, description: describe(ref) })),
    documents: planned.sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)),
    untouched: untouched.sort(),
    problems,
  };
};

export type VerifyResult = {
  ok: boolean;
  lines: readonly { ok: boolean; text: string; detail?: readonly string[] }[];
};

// The edited source against the plan. `upgrader` still reads from the plan's
// `from` stamp: an artifact the plan left untouched must still be one no
// pending migration would change.
export const verifySourceUpgrade = (options: { plan: SourcePlan; upgrader: Upgrader; documents: readonly SourceDocument[] }): VerifyResult => {
  const { plan, upgrader, documents } = options;
  const now = new Map(documents.map((d) => [keyOf(d), d]));
  const lines: { ok: boolean; text: string; detail?: readonly string[] }[] = [];

  for (const want of plan.documents) {
    const key = keyOf(want);
    const got = now.get(key);
    if (got === undefined) {
      lines.push({ ok: false, text: `${key} is gone — the plan expected it rewritten, not removed` });
    } else if (sameJson(got.document, want.expected)) {
      lines.push({ ok: true, text: `${key} matches its migrated JSON` });
    } else {
      lines.push({ ok: false, text: `${key} does not match its migrated JSON yet`, detail: diffJson(got.document, want.expected, 12) });
    }
  }
  for (const key of plan.untouched) {
    const got = now.get(key);
    if (got === undefined) {
      lines.push({ ok: false, text: `${key} is gone — no migration asked for that` });
      continue;
    }
    const again = upgrader.upgrade(got.document, { kind: got.kind, stamp: plan.from });
    if (!sameJson(again.document, got.document)) {
      lines.push({ ok: false, text: `${key} was not in the plan, but the migrations would change it now`, detail: diffJson(got.document, again.document, 12) });
    }
  }
  const known = new Set([...plan.documents.map(keyOf), ...plan.untouched]);
  for (const key of now.keys()) {
    if (!known.has(key)) lines.push({ ok: false, text: `${key} is new since the plan — plan again so it is checked too` });
  }
  const ok = lines.every((l) => l.ok);
  if (ok) lines.push({ ok: true, text: `${plan.untouched.length} artifact(s) no migration touches, still untouched` });
  return { ok, lines };
};

// The report a person — or an agent — works from.
export const renderReport = (plan: SourcePlan, expectedPathOf: (doc: PlannedDocument) => string): string => {
  const stamp = (s: Stamp): string => Object.entries(s).map(([k, v]) => `${k} ${v}`).join(', ');
  const out: string[] = [
    '# strata upgrade',
    '',
    `The source is written at **${stamp(plan.from)}**; the installed grammars are at **${stamp(plan.to)}**.`,
    '',
    '## Migrations',
    '',
    ...plan.migrations.map((m) => `- \`${m.ref}\` — ${m.description}`),
    '',
  ];
  if (plan.problems.length > 0) {
    out.push('## Stop: a migration is wrong', '', 'These artifacts would not pass their current schema after migrating — no edit can make `verify` pass. Fix the migration, then plan again.', '', ...plan.problems.map((p) => `- ${p}`), '');
  }
  if (plan.documents.length === 0) {
    out.push('## Nothing to edit', '', `No artifact changes (${plan.untouched.length} checked). Run \`verify\` to move the lock.`, '');
  } else {
    out.push(
      `## ${plan.documents.length} artifact(s) to edit`,
      '',
      'Edit each so that it serialises to EXACTLY its expected JSON (key order aside) — then run `verify`. Only what is listed changes; every other artifact must stay as it is.',
      '',
    );
    for (const doc of plan.documents) {
      out.push(`### \`${doc.id}\` (${doc.kind})`, '', doc.file === undefined ? '' : `- **File:** \`${doc.file}\``,
        doc.lookIn === undefined || doc.lookIn.length === 0 ? '' : `- **Look in:** ${doc.lookIn.map((f) => `\`${f}\``).join(', ')} — where the changing values are written`, `- **Migrations:** ${doc.applied.map((r) => `\`${r}\``).join(', ')}`, `- **Expected JSON:** \`${expectedPathOf(doc)}\``, '- **Changes:**', '', '```', ...doc.changes, '```', '');
    }
  }
  return out.filter((line, i, all) => !(line === '' && all[i - 1] === '')).join('\n');
};
