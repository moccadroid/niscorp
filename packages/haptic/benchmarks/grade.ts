// Grades a bench round against the blind references of its set.
// Usage: tsx benchmarks/grade.ts --set=tuned|heldout --round=<folder>
//   complete: every reference item matched, extras at most max(1, 10% of the reference);
//   useful partial: at least half matched; unusable: fewer; unresolved: no data.
// An item matches when one of its values contains the reference text (case and whitespace folded) or, for an address
// reference, equals it without its fragment (a path on another host counts).
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const arg = (name: string, fallback: string | null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const set = arg('set', 'tuned');
const round = arg('round', null);
if (!round) throw new Error('--round=<folder> is required');

type Reference = { key: 'url' | 'text'; items: { key: string }[] };
const norm = (v: unknown) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const strip = (u: unknown) => String(u ?? '').replace(/#.*$/, '');
const strings = (v: unknown): string[] =>
  v == null ? [] : typeof v === 'object' ? Object.values(v).flatMap(strings) : [String(v)];
const listOf = (data: unknown): unknown[] =>
  Array.isArray(data)
    ? data
    : data && typeof data === 'object'
      ? (Object.values(data).find(Array.isArray) ?? [data])
      : [];
const pathOf = (u: string) => strip(u).replace(/^https?:\/\/[^/]+/, '');
const matches = (item: unknown, ref: { key: string }, kind: Reference['key']) => {
  const values = strings(item);
  if (kind === 'url')
    return values.some(
      (v) =>
        strip(v) === strip(ref.key) ||
        (strip(v).endsWith(pathOf(ref.key)) && pathOf(ref.key).length > 1),
    );
  return values.some((v) => norm(v).includes(norm(ref.key)));
};

const rows: Record<string, unknown>[] = [];
const dir = `${root}/data/bench/${round}`;
for (const id of await readdir(dir)) {
  const ref = (await readFile(`${root}/benchmarks/${set}/references/${id}.json`, 'utf8').then(
    JSON.parse,
    () => null,
  )) as Reference | null;
  for (const run of await readdir(`${dir}/${id}`)) {
    const result = JSON.parse(await readFile(`${dir}/${id}/${run}/result.json`, 'utf8'));
    if (!ref) {
      rows.push({ id, run, outcome: 'no reference' });
      continue;
    }
    const items = result.data == null ? null : listOf(result.data);
    let outcome = 'unresolved';
    let matched = 0;
    let extra = 0;
    if (items) {
      matched = ref.items.filter((r) => items.some((i) => matches(i, r, ref.key))).length;
      extra = items.filter((i) => !ref.items.some((r) => matches(i, r, ref.key))).length;
      outcome =
        matched === ref.items.length && extra <= Math.max(1, Math.floor(ref.items.length * 0.1))
          ? 'complete'
          : matched * 2 >= ref.items.length
            ? 'useful partial'
            : 'unusable';
    }
    rows.push({
      id,
      run,
      outcome,
      matched: `${matched}/${ref.items.length}`,
      extra,
      tokens: result.inputTokens,
      seconds: Math.round((result.elapsedMs ?? 0) / 1000),
      reason: String(result.reason ?? '').slice(0, 60),
    });
  }
}
console.table(rows);
const count = (o: string) => rows.filter((r) => r.outcome === o).length;
const tokens = rows.map((r) => Number(r.tokens ?? 0));
const seconds = rows.map((r) => Number(r.seconds ?? 0)).sort((a, b) => a - b);
console.log({
  runs: rows.length,
  complete: count('complete'),
  usefulPartial: count('useful partial'),
  unusable: count('unusable'),
  unresolved: count('unresolved'),
  averageInputTokens: Math.round(tokens.reduce((s, t) => s + t, 0) / Math.max(1, rows.length)),
  medianSeconds: seconds[Math.floor(seconds.length / 2)],
});
