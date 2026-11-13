// Runs the artifacts a bench round saved again, with no model, on a later copy of the pages: what a caller gets when
// the artifact is reused after the site changed. Writes data/bench/<out>/<case>/<run>/result.json for
// benchmarks/grade.ts (grade it with the references written for that copy).
// Usage: tsx benchmarks/rerun.ts --set=tuned|heldout --round=<saved round> --captures=<folder under data/> --out=<round>
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { prepareArtifact } from '../src/artifact/prepare.js';
import type { HttpSource } from '../src/web/source.js';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const set = arg('set');
const round = arg('round');
const captures = arg('captures');
const out = arg('out');
if (!set || !round || !captures || !out)
  throw new Error('--set, --round, --captures and --out are required');

const cases = JSON.parse(await readFile(`${root}/benchmarks/${set}/suite.json`, 'utf8')).cases;
for (const c of cases) {
  const capture = await readFile(`${root}/data/${captures}/${c.id}.json`, 'utf8').then(
    JSON.parse,
    () => null,
  );
  if (!capture) continue;
  const sources = (capture.sources as HttpSource[]).filter((s) => s.status === 200);
  const pages = new Map(sources.map((s) => [s.url, s]));
  const start = sources.find((s) => s.url === capture.finalUrl) ?? sources[0];
  if (!start) continue;
  const saved = `${root}/data/bench/${round}/${c.id}`;
  for (const run of await readdir(saved).catch(() => [])) {
    const result = JSON.parse(await readFile(`${saved}/${run}/result.json`, 'utf8'));
    const dir = `${root}/data/bench/${out}/${c.id}/${run}`;
    await mkdir(dir, { recursive: true });
    const started = Date.now();
    let report: Record<string, unknown>;
    if (!result.artifact) report = { status: 'no artifact', data: null };
    else
      try {
        const walked = await prepareArtifact(result.artifact).run(
          { url: start.url },
          {
            signal: AbortSignal.timeout(120_000),
            pages: async (url) =>
              pages.get(url) ?? Promise.reject(new Error(`page not captured: ${url}`)),
          },
        );
        report = { status: 'ran', data: walked.data, emptyPages: walked.emptyPages };
      } catch (error) {
        report = { status: 'failed', reason: String((error as Error)?.message ?? error), data: null };
      }
    await writeFile(
      `${dir}/result.json`,
      JSON.stringify({ case: c.id, ...report, inputTokens: 0, elapsedMs: Date.now() - started }, null, 2),
    );
    console.log(c.id, run, report.status, String(report.reason ?? '').slice(0, 80));
  }
}
