import { evaluate, type Config } from '@niscorp/prism';
import { renderSource } from '../render/index.js';
import type { WebTransport } from '../web/transport.js';
import type { HttpSource } from '../web/source.js';
import {
  readHtmlResources,
  readJsonRecord,
  readReferences,
  readXmlRecords,
  type JsonRecord,
  type XmlRecord,
} from './formats.js';
import type { PreparedArtifact } from './prepare.js';
import {
  emptyTally,
  readLinks,
  readRecords,
  type ExtractedRecord,
  type RecordTally,
} from './stage.js';
import type { Policy, Stage } from './schema.js';

export type Redirect = { from: string; to: string; status: number };
export type StageRecord = ExtractedRecord | XmlRecord | JsonRecord;

export type WalkResult = {
  data: unknown;
  records: StageRecord[];
  visited: string[];
  redirects: Redirect[];
  // A link or reference stage had more pages to follow than the policy's maxPages left room for.
  limited: boolean;
  // Downloaded files, in the order their stages named them, at most the policy's maxResources.
  resources: HttpSource[];
  // Pages of the last level that yielded no records: a non-empty list means the artifact no longer fits the page.
  emptyPages: string[];
  broken: boolean;
};

// One page at one stage. A link or reference stage names the addresses the page gave (within the stage's limit and
// the policy's room); a record stage counts what it did with the elements its selector matched and, for each field,
// the records it kept without a value.
export type PageReport = { url: string; stage: number } & (
  | { links: string[]; selected: number | null }
  | (RecordTally & { kept: number; empty: Record<string, number> })
);

// What a run did, filled as it goes, so it is there when the run stops: the pages, then the last level's records
// before the program ran.
export type Report = { pages: PageReport[]; records: StageRecord[] | null };

export class WalkError extends Error {
  constructor(
    readonly code: 'STATUS' | 'REDIRECTS' | 'MEDIA_TYPE' | 'NO_PAGES' | 'PROGRAM' | 'SCHEMA',
    message: string,
  ) {
    super(message);
  }
}

const mediaType = (source: HttpSource) =>
  (source.headers['content-type']?.[0] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

// One page, following redirects within the policy; the final response must have an accepted status and media type.
export const fetchPage = async (
  web: WebTransport,
  url: string,
  policy: Policy,
  signal: AbortSignal,
  redirects: Redirect[] = [],
): Promise<HttpSource> => {
  let current = url;
  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    const source = await web.get(current, signal);
    const location = source.headers.location?.[0];
    if (source.status >= 300 && source.status < 400 && location) {
      const to = new URL(location, current).href;
      redirects.push({ from: current, to, status: source.status });
      current = to;
      continue;
    }
    if (!policy.accept.statuses.includes(source.status))
      throw new WalkError('STATUS', `${current} answered ${source.status}`);
    const types = policy.accept.mediaTypes;
    if (types && !types.includes(mediaType(source)))
      throw new WalkError(
        'MEDIA_TYPE',
        `${current} is ${mediaType(source) || 'without a content type'}`,
      );
    return source;
  }
  throw new WalkError('REDIRECTS', `more than ${policy.maxRedirects} redirects from ${url}`);
};

export type WalkOptions = { signal: AbortSignal } & (
  { web: WebTransport } | { pages: (url: string) => Promise<HttpSource> }
);

// Runs an artifact with no model: fetch, render where the stage says so, follow link and reference stages, read the
// record stage, download the files stages name, run the program and check its result against the output schema.
export const walk = async (
  prepared: PreparedArtifact,
  url: string,
  options: WalkOptions,
  report: Report = { pages: [], records: null },
): Promise<WalkResult> => {
  const { artifact } = prepared;
  const { policy } = artifact;
  const redirects: Redirect[] = [];
  const get =
    'pages' in options
      ? options.pages
      : (address: string) => fetchPage(options.web, address, policy, options.signal, redirects);
  const filePolicy: Policy = { ...policy, accept: { statuses: policy.accept.statuses } };
  const getFile =
    'pages' in options
      ? options.pages
      : (address: string) => fetchPage(options.web, address, filePolicy, options.signal, redirects);
  const visited = [url];
  const read = new Set<string>();
  const fileAddresses: string[] = [];
  let limited = false;
  // Two addresses that lead to one document read it once.
  const fresh = (sources: HttpSource[]) =>
    sources.filter((source) => {
      if (read.has(source.url)) return false;
      read.add(source.url);
      return true;
    });
  const files = (stage: Stage, source: HttpSource, named: string[]) => {
    const own =
      'resources' in stage && stage.resources
        ? readHtmlResources(source, stage.resources, options.signal)
        : [];
    for (const address of [...own, ...named])
      if (!fileAddresses.includes(address)) fileAddresses.push(address);
  };
  let current = fresh([await get(url)]);
  for (const [index, stage] of artifact.stages.entries()) {
    if ('render' in stage && stage.render)
      current = await Promise.all(current.map((source) => renderSource(source)));
    if (stage.kind !== 'records') {
      const wanted = stage.limit ?? Infinity;
      const room = Math.max(0, policy.maxPages - visited.length);
      const next: string[] = [];
      for (const source of current) {
        const take = (addresses: string[]) => {
          for (const raw of addresses) {
            const address = policy.stripFragments ? raw.replace(/#.*$/, '') : raw;
            if (next.length >= Math.min(wanted, room + 1)) break;
            if (!visited.includes(address) && !next.includes(address)) next.push(address);
          }
        };
        if (stage.kind === 'links') {
          files(stage, source, []);
          const tally = { selected: 0 };
          const links = readLinks(
            source,
            stage,
            {
              visited: new Set([...visited, ...next]),
              room: Math.min(wanted, room + 1) - next.length,
              stripFragments: policy.stripFragments,
            },
            options.signal,
            tally,
          );
          report.pages.push({ url: source.url, stage: index, links, selected: tally.selected });
          take(links);
        } else {
          const found = readReferences(
            source,
            stage,
            prepared.references[index] as Config,
            options.signal,
          );
          report.pages.push({ url: source.url, stage: index, links: found.links, selected: null });
          files(stage, source, found.resources);
          take(found.links);
        }
      }
      limited ||= next.length > room;
      const followed = next.slice(0, room);
      if (!followed.length)
        throw new WalkError(
          'NO_PAGES',
          limited
            ? `maxPages (${policy.maxPages}) leaves no room for linked pages`
            : `stage ${index + 1} found no page to follow`,
        );
      visited.push(...followed);
      current = fresh(await Promise.all(followed.map(get)));
      continue;
    }
    const perPage = current.map((source) => {
      files(stage, source, []);
      const tally = emptyTally();
      const records: StageRecord[] =
        stage.format === 'html'
          ? readRecords(source, stage, options.signal, tally)
          : stage.format === 'xml'
            ? readXmlRecords(source, stage, options.signal, tally)
            : [readJsonRecord(source)];
      if (stage.format === 'json') tally.selected = 1;
      const empty: Record<string, number> = {};
      if (stage.format !== 'json')
        for (const name of Object.keys(stage.fields))
          empty[name] = records.filter((record) =>
            [(record as ExtractedRecord | XmlRecord).fields[name]]
              .flat()
              .every((value) => value == null || String(value).trim() === ''),
          ).length;
      report.pages.push({ url: source.url, stage: index, ...tally, kept: records.length, empty });
      return { url: source.url, records };
    });
    const records = perPage.flatMap((page) => page.records);
    report.records = records;
    const emptyPages = perPage.filter((page) => !page.records.length).map((page) => page.url);
    const resources: HttpSource[] = [];
    for (const address of fileAddresses.slice(0, policy.maxResources ?? 0))
      resources.push(await getFile(address));
    let data: unknown;
    try {
      data = evaluate(prepared.program, { records } as never, { check: 'always' });
    } catch (error) {
      throw new WalkError('PROGRAM', String((error as Error)?.message ?? error));
    }
    const wrong = prepared.checkOutput(data);
    if (wrong) throw new WalkError('SCHEMA', wrong);
    return {
      data,
      records,
      visited,
      redirects,
      limited,
      resources,
      emptyPages,
      broken: emptyPages.length > 0,
    };
  }
  throw new WalkError('NO_PAGES', 'no record stage');
};
