// Grades bench rounds against the blind references of their set.
// Usage: tsx benchmarks/grade.ts --set=tuned|heldout --round=<folder>[,<folder>…] [--references=<dir>] [--quiet]
//   complete: every reference item answered, extras at most max(1, 10% of the reference);
//   useful partial: at least half answered; unusable: fewer; unresolved: no data.
// A result item answers a reference item when one of its values contains the reference text (case and whitespace
// folded) or, for an address reference, equals it without its fragment (a path on another host counts); and, when the
// reference item lists them, its values contain every `include` text and no `exclude` text. Each result item answers
// at most one reference item; every result item left over (unrelated, or a duplicate of an answer) is an extra.
// Several rounds: one line per round, then the spread of complete runs across them.
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const arg = (name: string, fallback: string | null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const set = arg('set', 'tuned');
const rounds = arg('round', null)?.split(',');
if (!rounds) throw new Error('--round=<folder> is required');
const references = arg('references', `benchmarks/${set}/references`);
const quiet = process.argv.includes('--quiet') || rounds.length > 1;

type Answer = { key: string; include?: string[]; exclude?: string[] };
type Reference = { key: 'url' | 'text'; items: Answer[] };
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
const answers = (item: unknown, answer: Answer, kind: Reference['key']) => {
  const values = strings(item);
  const folded = values.map(norm);
  const key =
    kind === 'url'
      ? values.some(
          (v) =>
            strip(v) === strip(answer.key) ||
            (strip(v).endsWith(pathOf(answer.key)) && pathOf(answer.key).length > 1),
        )
      : folded.some((v) => v.includes(norm(answer.key)));
  return (
    key &&
    (answer.include ?? []).every((t) => folded.some((v) => v.includes(norm(t)))) &&
    !(answer.exclude ?? []).some((t) => folded.some((v) => v.includes(norm(t))))
  );
};
// The most reference items that distinct result items answer (a largest matching, by augmenting paths).
const matchedCount = (refs: Answer[], items: unknown[], kind: Reference['key']) => {
  const taken = new Array<number>(items.length).fill(-1);
  const assign = (r: number, seen: boolean[]): boolean =>
    items.some((item, i) => {
      if (seen[i] || !answers(item, refs[r] as Answer, kind)) return false;
      seen[i] = true;
      if (taken[i] !== -1 && !assign(taken[i] as number, seen)) return false;
      taken[i] = r;
      return true;
    });
  return refs.filter((_, r) => assign(r, new Array<boolean>(items.length).fill(false))).length;
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? ((s[(s.length - 1) >> 1] as number) + (s[s.length >> 1] as number)) / 2 : 0;
};

const summaries: Record<string, unknown>[] = [];
for (const round of rounds) {
  const rows: Record<string, unknown>[] = [];
  const dir = `${root}/data/bench/${round}`;
  for (const id of await readdir(dir)) {
    const ref = (await readFile(`${root}/${references}/${id}.json`, 'utf8').then(
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
        matched = matchedCount(ref.items, items, ref.key);
        extra = items.length - matched;
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
  if (!quiet) console.table(rows);
  const graded = rows.filter((r) => r.outcome !== 'no reference');
  const count = (o: string) => graded.filter((r) => r.outcome === o).length;
  summaries.push({
    round,
    runs: graded.length,
    complete: count('complete'),
    usefulPartial: count('useful partial'),
    unusable: count('unusable'),
    unresolved: count('unresolved'),
    averageInputTokens: Math.round(
      graded.reduce((s, r) => s + Number(r.tokens ?? 0), 0) / Math.max(1, graded.length),
    ),
    medianSeconds: median(graded.map((r) => Number(r.seconds ?? 0))),
  });
}
if (rounds.length === 1) console.log(summaries[0]);
else {
  console.table(summaries);
  const complete = summaries.map((s) => Number(s.complete));
  console.log({
    rounds: rounds.length,
    completeMean: Math.round((complete.reduce((a, b) => a + b, 0) / complete.length) * 10) / 10,
    completeMin: Math.min(...complete),
    completeMax: Math.max(...complete),
  });
}
