// Saves each case's pages as the bench reads them: the start page with its redirects and, for a case that follows
// links, every same-site page the start page links to (at most 60), so a capture does not depend on which links are
// the right ones. Fetched the way discovery fetches, with Haptic's own web transport.
// Usage: tsx benchmarks/capture.ts --set=tuned|heldout --out=<folder under data/> [--case=a,b]
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as cheerio from 'cheerio';
import type { HttpSource } from '../src/web/source.js';
import { createWebTransport } from '../src/web/transport.js';

const root = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const set = arg('set');
const out = arg('out');
if ((set !== 'tuned' && set !== 'heldout') || !out)
  throw new Error('--set=tuned|heldout and --out=<folder> are required');
const only = arg('case')?.split(',');
const MAX_LINKED = 60;
const web = createWebTransport();
const signal = AbortSignal.timeout(900_000);

const following = async (url: string) => {
  const chain: HttpSource[] = [];
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const source = await web.get(current, signal);
    chain.push(source);
    const location = source.headers.location?.[0];
    if (source.status >= 300 && source.status < 400 && location) {
      current = new URL(location, current).href;
      continue;
    }
    return { final: source, chain };
  }
  throw new Error(`too many redirects from ${url}`);
};

const cases = JSON.parse(await readFile(`${root}/benchmarks/${set}/suite.json`, 'utf8')).cases;
await mkdir(`${root}/data/${out}`, { recursive: true });
const report: Record<string, unknown>[] = [];
for (const c of cases) {
  if (only && !only.includes(c.id)) continue;
  try {
    const { final, chain } = await following(c.url);
    const sources = [...chain];
    let linked = 0;
    if (c.allowLinkFollowing) {
      const $ = cheerio.load(Buffer.from(final.body.base64, 'base64').toString('utf8'));
      const origin = new URL(final.url).origin;
      const urls = [
        ...new Set(
          $('a[href]')
            .toArray()
            .map((a) => {
              try {
                const u = new URL($(a).attr('href') ?? '', final.url);
                u.hash = '';
                return u.origin === origin && u.href !== final.url ? u.href : null;
              } catch {
                return null;
              }
            })
            .filter((u): u is string => Boolean(u)),
        ),
      ].slice(0, MAX_LINKED);
      for (const url of urls) {
        try {
          sources.push(...(await following(url)).chain);
          linked++;
        } catch {}
      }
    }
    await writeFile(
      `${root}/data/${out}/${c.id}.json`,
      JSON.stringify({ url: c.url, finalUrl: final.url, capturedAt: new Date().toISOString(), sources }),
    );
    report.push({ id: c.id, status: final.status, bytes: final.body.bytes, linked });
  } catch (error) {
    report.push({ id: c.id, error: String((error as Error)?.message ?? error).slice(0, 80) });
  }
}
await web.close();
console.table(report);
