// Live discovery over saved pages: the tuned set (17 pages, captures in benchmarks/tuned/captures) or the held-out
// set (11 sites; its captures are 59 MB and stay in data/pilot/heldout/captures). Each run writes
// data/bench/<round>/<case>/run<n>/result.json for benchmarks/grade.ts.
// Usage: tsx benchmarks/discovery-bench.ts --set=tuned|heldout --round=<folder> [--runs=3] [--case=a,b]
//   [--efforts=low,medium] the effort ladder (default: the profile's).
//   [--from=<round>] only the runs of that saved round whose first attempt did not get ready: the first attempt
//   replays its saved model answers, the later attempts run live. Compares later efforts on the same first attempts.
// Times are only comparable on a quiet machine, so a second bench refuses to start while one runs.
import { rmSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import type { Calls } from '../src/discovery/calls.js';
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
const efforts = arg('efforts', null)?.split(',') as ('low' | 'medium' | 'high')[] | undefined;
const from = arg('from', null);
process.loadEnvFile(`${root}/.env`);
const groqKey = process.env.GROQ_API_KEY;
if (!groqKey) throw new Error('GROQ_API_KEY is not set');

const lock = `${root}/data/bench/.running`;
const holder = Number(await readFile(lock, 'utf8').catch(() => '0'));
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
if (holder && holder !== process.pid && alive(holder))
  throw new Error(`another bench is running (process ${holder}); its times and this one's would mix`);
await mkdir(`${root}/data/bench`, { recursive: true });
await writeFile(lock, String(process.pid));
process.on('exit', () => rmSync(lock, { force: true }));

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

type SavedEvent = { job: string; event: Record<string, unknown> };
// Model calls answered from a saved attempt's events.
const replay = (events: SavedEvent[]): Calls => {
  const answers = new Map<string, unknown>();
  for (const { job, event } of events)
    if (event.type === 'answer' && event.ok) answers.set(job, event.data);
  const sections = events.filter((e) => e.job === 'section').map((e) => e.event.key ?? null);
  const members = events
    .filter((e) => e.job === 'members' && e.event.type === 'jev')
    .map((e) => e.event.keep);
  return {
    event: () => {},
    jevLeft: () => Infinity,
    async agent(spec) {
      const data = answers.get(spec.job) as never;
      if (data === undefined) return null;
      for (let i = 0; i < spec.steps; i++) if ((await spec.validate(data)) === null) return data;
      return null;
    },
    async decide(job, _state, questions) {
      const queue = job === 'section' ? sections : members;
      return Object.fromEntries(
        Object.keys(questions).map((k) => [k, (queue.shift() as string | boolean) ?? null]),
      );
    },
  };
};
const plannedRuns = async (id: string): Promise<{ name: string; first: SavedEvent[] | null }[]> => {
  if (!from) return Array.from({ length: runs }, (_, i) => ({ name: `run${i + 1}`, first: null }));
  const dir = `${root}/data/bench/${from}/${id}`;
  const out: { name: string; first: SavedEvent[] | null }[] = [];
  for (const name of await readdir(dir).catch(() => [])) {
    const saved = JSON.parse(await readFile(`${dir}/${name}/result.json`, 'utf8'));
    if (saved.attempts?.[0]?.status === 'ready') continue;
    const events: SavedEvent[] = JSON.parse(await readFile(`${dir}/${name}/events.json`, 'utf8'));
    const second = events.findIndex((e, i) => i > 0 && e.job === 'attempt');
    out.push({ name, first: second === -1 ? events : events.slice(0, second) });
  }
  return out;
};

for (const c of cases) {
  const pages = new Map(c.sources.map((s) => [s.url, s]));
  for (const { name, first } of await plannedRuns(c.id)) {
    const outDir = `${root}/data/bench/${round}/${c.id}/${name}`;
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
          ...(efforts ? { profile: { efforts } } : {}),
          ...(first ? { calls: (_effort, index) => (index === 0 ? replay(first) : undefined) } : {}),
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
          run: name,
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
          run: name,
          status: 'crashed',
          error: String((error as Error)?.message ?? error),
        }),
      );
    }
  }
}
