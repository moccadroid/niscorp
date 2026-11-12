// Live discovery over saved pages: the tuned set (17 pages, captures in benchmarks/tuned/captures) or the held-out
// set (12 sites; its captures are 59 MB and stay in data/pilot/heldout/captures). Each run writes
// data/bench/<round>/<case>/run<n>/result.json for benchmarks/grade.ts.
// Usage: tsx benchmarks/discovery-bench.ts --set=tuned|heldout --round=<folder> [--runs=3] [--case=a,b]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { discover } from '../src/discovery/discover.js';
import type { HttpSource } from '../src/web/source.js';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const arg = (name: string, fallback: string | null) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const set = arg('set', 'tuned');
const round = arg('round', null);
if (!round) throw new Error('--round=<folder> is required');
if (set !== 'tuned' && set !== 'heldout') throw new Error('--set is tuned or heldout');
const runs = Number(arg('runs', '3'));
const only = arg('case', null)?.split(',');
process.loadEnvFile(`${root}/.env`);
const groqKey = process.env.GROQ_API_KEY;
if (!groqKey) throw new Error('GROQ_API_KEY is not set');

type Case = {
  id: string;
  url: string;
  instruction: string;
  allowLinkFollowing: boolean;
  linkDepth: number;
  sources: HttpSource[];
};
type Capture = { finalUrl?: string; sources: HttpSource[] };
const json = async (path: string) => JSON.parse(await readFile(`${root}/${path}`, 'utf8'));
const captureOf = async (id: string): Promise<Capture | null> => {
  if (set === 'tuned' && id === 'sqlite-release-notes')
    return { sources: await json('benchmarks/tuned/captures/sqlite-release-notes.sources.json') };
  return json(
    set === 'tuned'
      ? `benchmarks/tuned/captures/${id}.json`
      : `data/pilot/heldout/captures/${id}.json`,
  ).catch(() => null);
};

const cases: Case[] = [];
for (const c of (await json(`benchmarks/${set}/suite.json`)).cases) {
  if (only && !only.includes(c.id)) continue;
  const capture = await captureOf(c.id);
  if (!capture) continue;
  const sources = capture.sources.filter((s) => s.status === 200);
  const start = sources.find((s) => s.url === capture.finalUrl) ?? sources[0];
  if (start)
    cases.push({
      id: c.id,
      url: start.url,
      instruction: c.instruction,
      allowLinkFollowing: Boolean(c.allowLinkFollowing),
      linkDepth: c.linkDepth ?? 1,
      sources,
    });
}

for (const c of cases) {
  const pages = new Map(c.sources.map((s) => [s.url, s]));
  for (let n = 1; n <= runs; n++) {
    const outDir = `${root}/data/bench/${round}/${c.id}/run${n}`;
    await mkdir(outDir, { recursive: true });
    try {
      const result = await discover(
        {
          url: c.url,
          instruction: c.instruction,
          allowLinkFollowing: c.allowLinkFollowing,
          linkDepth: c.linkDepth,
        },
        {
          groqKey,
          typesafeKey: process.env.TYPESAFE_API_KEY ?? null,
          pages: async (url) =>
            pages.get(url) ?? Promise.reject(new Error(`linked page not captured: ${url}`)),
        },
      );
      const { events, ...report } = result;
      await writeFile(`${outDir}/result.json`, JSON.stringify({ case: c.id, ...report }, null, 2));
      await writeFile(`${outDir}/events.json`, JSON.stringify(events, null, 2));
      console.log(
        JSON.stringify({
          case: c.id,
          run: n,
          status: result.status,
          tokens: result.inputTokens,
          seconds: Math.round(result.elapsedMs / 1000),
          attempts: result.attempts.map((a) => `${a.effort}:${a.status}`),
          reason: result.reason,
        }),
      );
    } catch (error) {
      await writeFile(
        `${outDir}/result.json`,
        JSON.stringify(
          { case: c.id, status: 'crashed', error: String((error as Error)?.stack ?? error) },
          null,
          2,
        ),
      );
      console.log(
        JSON.stringify({
          case: c.id,
          run: n,
          status: 'crashed',
          error: String((error as Error)?.message ?? error),
        }),
      );
    }
  }
}
