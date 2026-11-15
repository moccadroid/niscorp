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
import { fillRequest, getRequest, requestKey, type PageRequest, type Values } from './request.js';
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
  // A stage had more pages to follow than the policy's maxPages left room for.
  limited: boolean;
  // Downloaded files, in the order their stages named them, at most the policy's maxResources.
  resources: HttpSource[];
  // Pages of the last level that yielded no records: a non-empty list means the artifact no longer fits the page.
  emptyPages: string[];
  broken: boolean;
};

// One page at one stage. A link or reference stage names the addresses the page gave (within the stage's limit and
// the policy's room); a record stage counts what it did with the elements its selector matched and, for each field,
// the records it kept without a value. A page the run started from says the values it was requested with, or the next
// link that reached it.
export type PageReport = { url: string; stage: number; values?: Values; link?: string } & (
  | { links: string[]; selected: number | null }
  | (RecordTally & { kept: number; empty: Record<string, number> })
);

// What a run did, filled as it goes, so it is there when the run stops: the pages, then the last level's records
// before the program ran.
export type Report = { pages: PageReport[]; records: StageRecord[] | null };

export class WalkError extends Error {
  constructor(
    readonly code:
      | 'INPUT'
      | 'STATUS'
      | 'REDIRECTS'
      | 'MEDIA_TYPE'
      | 'NO_PAGES'
      | 'MORE'
      | 'PROGRAM'
      | 'SCHEMA',
    message: string,
  ) {
    super(message);
  }
}

// Where a run starts: the address, for an artifact without a request; the values of its inputs.
export type RunInput = { url?: string; inputs?: Record<string, string> };

const mediaType = (source: HttpSource) =>
  (source.headers['content-type']?.[0] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';

type Fetched = { source: HttpSource; key: string };

const keyOf = (request: PageRequest, source: HttpSource) =>
  request.method === 'GET' ? source.url : requestKey(request);

// One request, following redirects within the policy: 307 and 308 send it again as it was, any other with GET and no
// body. The final response must have an accepted status and media type.
const fetchRequest = async (
  web: WebTransport,
  request: PageRequest,
  policy: Policy,
  signal: AbortSignal,
  redirects: Redirect[],
): Promise<Fetched> => {
  let current = request;
  for (let hop = 0; hop <= policy.maxRedirects; hop++) {
    const source = await web.send(current, signal);
    const location = source.headers.location?.[0];
    if (source.status >= 300 && source.status < 400 && location) {
      const to = new URL(location, current.url).href;
      redirects.push({ from: current.url, to, status: source.status });
      const headers = Object.fromEntries(
        Object.entries(current.headers).filter(([name]) => name.toLowerCase() !== 'content-type'),
      );
      current =
        source.status === 307 || source.status === 308
          ? { ...current, url: to }
          : { method: 'GET', url: to, headers, body: null };
      continue;
    }
    if (!policy.accept.statuses.includes(source.status))
      throw new WalkError('STATUS', `${current.url} answered ${source.status}`);
    const types = policy.accept.mediaTypes;
    if (types && !types.includes(mediaType(source)))
      throw new WalkError(
        'MEDIA_TYPE',
        `${current.url} is ${mediaType(source) || 'without a content type'}`,
      );
    return { source, key: keyOf(current, source) };
  }
  throw new WalkError('REDIRECTS', `more than ${policy.maxRedirects} redirects from ${request.url}`);
};

// One page by its address, following redirects within the policy.
export const fetchPage = async (
  web: WebTransport,
  url: string,
  policy: Policy,
  signal: AbortSignal,
  redirects: Redirect[] = [],
): Promise<HttpSource> => (await fetchRequest(web, getRequest(url), policy, signal, redirects)).source;

export type WalkOptions = { signal: AbortSignal } & (
  | { web: WebTransport }
  | { pages: (request: PageRequest) => Promise<HttpSource> }
);

const startValues = (prepared: PreparedArtifact, input: RunInput): Values => {
  const { artifact } = prepared;
  const declared = Object.keys(artifact.inputs ?? {});
  const given = input.inputs ?? {};
  const problems: string[] = [];
  if (artifact.request && input.url !== undefined)
    problems.push('this artifact starts from its request: run it without url');
  if (!artifact.request && input.url === undefined)
    problems.push('this artifact has no request: run it with url');
  for (const [name, value] of Object.entries(given)) {
    if (!declared.includes(name))
      problems.push(
        `"${name}" is not an input; the inputs are ${declared.map((n) => `"${n}"`).join(', ') || 'none'}`,
      );
    else if (typeof value !== 'string') problems.push(`input "${name}" must be a string`);
  }
  for (const name of declared) if (!(name in given)) problems.push(`input "${name}" is missing`);
  if (problems.length) throw new WalkError('INPUT', problems.join('; '));
  return { ...artifact.request?.start, ...given };
};

const filled = (prepared: PreparedArtifact, values: Values): PageRequest => {
  const request = fillRequest(prepared.artifact.request!, values);
  for (const [name, value] of Object.entries(request.headers))
    if (/[\r\n]/.test(value))
      throw new WalkError('INPUT', `request.headers.${name} has a line break once filled`);
  return request;
};

// The values `more` answers for the next request: null to stop, or start values with their new values.
const moreValues = (
  prepared: PreparedArtifact,
  source: HttpSource,
  values: Values,
): Values | null => {
  let document: unknown = null;
  try {
    document = readJsonRecord(source).document;
  } catch {
    document = null;
  }
  let answer: unknown;
  try {
    answer = evaluate(
      prepared.more as Config,
      { document, headers: source.headers, values, url: source.url } as never,
      { check: 'always' },
    );
  } catch (error) {
    throw new WalkError('MORE', `request.more failed on ${source.url}: ${(error as Error).message}`);
  }
  if (answer === null) return null;
  const known = Object.keys(prepared.artifact.request?.start ?? {});
  if (!answer || typeof answer !== 'object' || Array.isArray(answer))
    throw new WalkError('MORE', 'request.more must answer null or an object of start values');
  for (const [name, value] of Object.entries(answer)) {
    if (!known.includes(name))
      throw new WalkError(
        'MORE',
        `request.more answered "${name}", which is not a start value; they are ${known.map((n) => `"${n}"`).join(', ') || 'none'}`,
      );
    if (typeof value !== 'string' && typeof value !== 'number')
      throw new WalkError('MORE', `request.more answered "${name}" as neither a string nor a number`);
  }
  return { ...values, ...(answer as Values) };
};

// Runs an artifact with no model: fetch, render where the stage says so, page on through the pages the run starts
// from, follow link and reference stages, read the record stage, download the files stages name, run the program and
// check its result against the output schema.
export const walk = async (
  prepared: PreparedArtifact,
  input: RunInput,
  options: WalkOptions,
  report: Report = { pages: [], records: null },
): Promise<WalkResult> => {
  const { artifact } = prepared;
  const { policy } = artifact;
  const signal = options.signal;
  const redirects: Redirect[] = [];
  const get = async (request: PageRequest): Promise<Fetched> => {
    if ('pages' in options) {
      const source = await options.pages(request);
      return { source, key: keyOf(request, source) };
    }
    return fetchRequest(options.web, request, policy, signal, redirects);
  };
  const filePolicy: Policy = { ...policy, accept: { statuses: policy.accept.statuses } };
  const getFile =
    'pages' in options
      ? (address: string) => options.pages(getRequest(address))
      : (address: string) => fetchPage(options.web, address, filePolicy, signal, redirects);

  const startedWith = startValues(prepared, input);
  const start = artifact.request ? filled(prepared, startedWith) : getRequest(input.url!);
  const sent = new Set([requestKey(start)]);
  const visited = [start.url];
  const read = new Set<string>();
  const fileAddresses: string[] = [];
  let limited = false;
  // Two requests that lead to one document read it once.
  const fresh = (fetched: Fetched[]) =>
    fetched
      .filter(({ key }) => {
        if (read.has(key)) return false;
        read.add(key);
        return true;
      })
      .map(({ source }) => source);
  const files = (stage: Stage, source: HttpSource, named: string[]) => {
    const own =
      'resources' in stage && stage.resources ? readHtmlResources(source, stage.resources, signal) : [];
    for (const address of [...own, ...named])
      if (!fileAddresses.includes(address)) fileAddresses.push(address);
  };
  const strip = (address: string) => (policy.stripFragments ? address.replace(/#.*$/, '') : address);

  // The pages the run starts from: the next one after this page, reached by the next link or by the values `more`
  // answers; null when there is none or it is a request already sent.
  type Step = { request: PageRequest; values?: Values; link?: string };
  const nextStep = (source: HttpSource, values: Values): Step | null => {
    let step: Step | null = null;
    if (artifact.next) {
      const address = readHtmlResources(source, artifact.next, signal)[0];
      if (address) step = { request: getRequest(strip(address)), link: strip(address) };
    } else if (artifact.request?.more !== undefined) {
      const next = moreValues(prepared, source, values);
      if (next) step = { request: filled(prepared, next), values: next };
    }
    if (!step || sent.has(requestKey(step.request))) return null;
    return step;
  };
  const pagesOn = Boolean(artifact.next || artifact.request?.more !== undefined);
  const firstMark = artifact.request ? { values: startedWith } : {};

  let current = fresh([await get(start)]);
  for (const [index, stage] of artifact.stages.entries()) {
    const render = (source: HttpSource) =>
      'render' in stage && stage.render ? renderSource(source) : Promise.resolve(source);
    current = await Promise.all(current.map(render));
    const continues = index === 0 && pagesOn;
    // Fetches the next page the run starts from, when the policy leaves room; null to stop.
    const following = async (
      source: HttpSource,
      values: Values,
    ): Promise<{ source: HttpSource; values: Values; mark: { values?: Values; link?: string } } | null> => {
      const step = nextStep(source, values);
      if (!step) return null;
      if (visited.length >= policy.maxPages) {
        limited = true;
        return null;
      }
      sent.add(requestKey(step.request));
      visited.push(step.request.url);
      const [page] = fresh([await get(step.request)]);
      if (!page) return null;
      const mark = step.link !== undefined ? { link: step.link } : { values: step.values };
      return { source: await render(page), values: step.values ?? values, mark };
    };

    if (stage.kind !== 'records') {
      const wanted = stage.limit ?? Infinity;
      const queued: string[] = [];
      const collect = (source: HttpSource, mark: { values?: Values; link?: string }) => {
        const room = Math.max(0, policy.maxPages - visited.length);
        const cap = Math.min(wanted, room + 1);
        const before = queued.length;
        const take = (addresses: string[]) => {
          for (const raw of addresses) {
            const address = strip(raw);
            if (queued.length >= cap) break;
            if (!visited.includes(address) && !queued.includes(address)) queued.push(address);
          }
        };
        if (stage.kind === 'links') {
          files(stage, source, []);
          const tally = { selected: 0 };
          const links = readLinks(
            source,
            stage,
            {
              visited: new Set([...visited, ...queued]),
              room: cap - queued.length,
              stripFragments: policy.stripFragments,
            },
            signal,
            tally,
          );
          report.pages.push({ url: source.url, stage: index, ...mark, links, selected: tally.selected });
          take(links);
        } else {
          const found = readReferences(source, stage, prepared.references[index] as Config, signal);
          report.pages.push({ url: source.url, stage: index, ...mark, links: found.links, selected: null });
          files(stage, source, found.resources);
          take(found.links);
        }
        return queued.length - before;
      };
      for (const source of current) collect(source, index === 0 ? firstMark : {});
      if (continues && current[0]) {
        let page: HttpSource = current[0];
        let values = startedWith;
        while (queued.length < wanted) {
          const room = Math.max(0, policy.maxPages - visited.length);
          if (queued.length >= room - 1) {
            if (nextStep(page, values)) limited = true;
            break;
          }
          const next = await following(page, values);
          if (!next) break;
          if (collect(next.source, next.mark) === 0) break;
          page = next.source;
          values = next.values;
        }
      }
      const room = Math.max(0, policy.maxPages - visited.length);
      limited ||= queued.length > room;
      const followed = queued.slice(0, room);
      if (!followed.length)
        throw new WalkError(
          'NO_PAGES',
          limited
            ? `maxPages (${policy.maxPages}) leaves no room for linked pages`
            : `stage ${index + 1} found no page to follow`,
        );
      visited.push(...followed);
      current = fresh(await Promise.all(followed.map((address) => get(getRequest(address)))));
      continue;
    }

    // Records the pages the run starts from have already given, so a page that continues them keeps only new ones.
    const seen = new Set<string>();
    const sameAs = (record: StageRecord) =>
      JSON.stringify('fields' in record ? record.fields : record.document);
    const readPage = (
      source: HttpSource,
      mark: { values?: Values; link?: string },
      continuing: boolean,
    ) => {
      files(stage, source, []);
      const tally = emptyTally();
      let records: StageRecord[] =
        stage.format === 'html'
          ? readRecords(source, stage, signal, tally)
          : stage.format === 'xml'
            ? readXmlRecords(source, stage, signal, tally)
            : [readJsonRecord(source)];
      if (stage.format === 'json') tally.selected = 1;
      if (continuing) {
        const before = records.length;
        records = records.filter((record) => !seen.has(sameAs(record)));
        tally.duplicates += before - records.length;
      }
      if (continues) for (const record of records) seen.add(sameAs(record));
      const empty: Record<string, number> = {};
      if (stage.format !== 'json')
        for (const name of Object.keys(stage.fields))
          empty[name] = records.filter((record) =>
            [(record as ExtractedRecord | XmlRecord).fields[name]]
              .flat()
              .every((value) => value == null || String(value).trim() === ''),
          ).length;
      report.pages.push({ url: source.url, stage: index, ...mark, ...tally, kept: records.length, empty });
      return { url: source.url, records };
    };
    const perPage = current.map((source) => readPage(source, index === 0 ? firstMark : {}, false));
    if (continues && current[0]) {
      let page: HttpSource = current[0];
      let values = startedWith;
      for (;;) {
        const next = await following(page, values);
        if (!next) break;
        const gave = readPage(next.source, next.mark, true);
        if (!gave.records.length) break;
        perPage.push(gave);
        page = next.source;
        values = next.values;
      }
    }
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
