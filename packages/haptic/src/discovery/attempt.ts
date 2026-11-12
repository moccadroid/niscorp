import type { CheerioAPI } from 'cheerio';
import { z } from 'zod';
import type { Config } from '@niscorp/prism';
import { readRecords, type ExtractedRecord } from '../artifact/stage.js';
import type { FieldRule, LinkStage, RecordStage } from '../artifact/schema.js';
import { renderSource, showsDecoyLinks } from '../render/index.js';
import { readSourceBody, type HttpSource } from '../web/source.js';
import { DiscoveryStop, type Calls } from './calls.js';
import { baseOf, exampleValues, hasExample, resultFindings } from './findings.js';
import { linkRule, withoutLineNumbers } from './links.js';
import { distinctLists, pickList, requiredFields } from './lists.js';
import { labelRecords } from './members.js';
import { findWhere } from './phrase.js';
import type { DiscoveryProfile } from './profile.js';
import { inferSchema, writeProgram, type JsonSchema } from './program.js';
import { FIELDS_INSTRUCTIONS, fieldsContext, READ_INSTRUCTIONS, readContext } from './prompts.js';
import {
  ReadAnswerSchema,
  resolveAnswer,
  type Example,
  type ReadAnswer,
  type Resolved,
} from './read.js';
import { candidates, hits, valueOf, type FoundRule } from './rules.js';
import { textForRead } from './sections.js';
import { buildLines, load } from './view.js';

export type DiscoveryRequest = {
  url: string;
  instruction: string;
  outputSchema: JsonSchema | null;
  linkDepth: number;
};

export type AttemptReport = {
  status: 'ready' | 'unresolved' | 'blocked';
  reason: string | null;
  findings: string[];
  stages: (LinkStage | RecordStage)[];
  program: Config | null;
  outputSchema: JsonSchema | null;
  data: unknown;
  next: string[];
  visited: string[];
  read: ReadAnswer | null;
  stop: DiscoveryStop | null;
};

const FieldsAnswerSchema = z.record(
  z.string().min(1),
  z.object({ selector: z.string().min(1), attribute: z.string().min(1).nullable() }).strict(),
);

const html = (source: HttpSource) => readSourceBody(source).toString('utf8');
const clip = (value: string, n: number) => (value.length > n ? `${value.slice(0, n)}…` : value);
const fieldNamesOf = (schema: JsonSchema | null) => {
  if (!schema) return null;
  const items = schema.items as JsonSchema | undefined;
  return Object.keys((items?.properties ?? schema.properties ?? {}) as object);
};

// One attempt at one effort: read each level, find its rules, label, filter, write the program.
export const runAttempt = async ({
  request,
  pages,
  calls,
  profile,
  signal,
}: {
  request: DiscoveryRequest;
  pages: (url: string) => Promise<HttpSource>;
  calls: Calls;
  profile: DiscoveryProfile;
  signal: AbortSignal;
}): Promise<AttemptReport> => {
  const stages: AttemptReport['stages'] = [];
  const next: string[] = [];
  const visited = [request.url];
  let read: ReadAnswer | null = null;
  const finish = (
    outcome: Partial<AttemptReport> & Pick<AttemptReport, 'status'>,
  ): AttemptReport => ({
    reason: null,
    findings: [],
    program: null,
    outputSchema: null,
    data: null,
    stop: null,
    ...outcome,
    stages,
    next,
    visited,
    read,
  });
  try {
    const fieldNames = fieldNamesOf(request.outputSchema);
    let current = [await pages(request.url)];
    let task = request.instruction;
    for (let depth = 0; ; depth++) {
      // If any page of this level shows the decoy signal, every page of it is rendered before anything reads it.
      const rendering = current.some((source) => showsDecoyLinks(html(source)));
      if (rendering) current = await Promise.all(current.map((source) => renderSource(source)));
      calls.event(`render-${depth}`, { type: 'render', rendering });
      const page = current[0] as HttpSource;
      const $ = load(html(page));
      const lines = buildLines($);
      const mayFollow = depth < request.linkDepth;
      let resolved: Resolved = { problems: [], examples: [], follow: [] };
      const text = await textForRead({
        lines,
        base: page.url,
        instruction: task,
        calls,
        budget: profile.readBudgetChars,
      });
      read = await calls.agent<ReadAnswer>({
        job: `read-${depth}`,
        instructions: READ_INSTRUCTIONS,
        schema: ReadAnswerSchema,
        input: readContext({
          instruction: task,
          fieldNames,
          mayFollow,
          reachedFrom: depth > 0 ? request.url : null,
          text,
        }),
        steps: profile.readSteps,
        validate: (answer) => {
          const found = resolveAnswer($, lines, answer, { fieldNames, mayFollow, base: page.url });
          if (found.problems.length)
            return `Fix these and answer again:\n${found.problems.map((p) => `- ${p}`).join('\n')}`;
          resolved = found;
          return null;
        },
      });
      if (!read) return finish({ status: 'unresolved', reason: `read at depth ${depth} failed` });

      if (resolved.follow.length) {
        const limit = read.limit ?? resolved.follow.length;
        const rule = linkRule($, resolved.follow, { limit, pageUrl: page.url, visited });
        if ('error' in rule) return finish({ status: 'unresolved', reason: rule.error });
        calls.event(`links-${depth}`, {
          type: 'chosen',
          options: rule.options,
          selector: rule.selector,
          count: rule.urls.length,
        });
        const room = profile.maxPages - visited.length;
        const urls = rule.urls.slice(0, Math.max(0, room));
        if (!urls.length)
          return finish({
            status: 'unresolved',
            reason: `the page cap (${profile.maxPages}) leaves no room for linked pages`,
          });
        stages.push({
          kind: 'links',
          format: 'html',
          render: rendering,
          selector: rule.selector,
          link: rule.link,
          limit,
        });
        current = await Promise.all(urls.map(pages));
        visited.push(...urls);
        task = withoutLineNumbers(read.next);
        next.push(task);
        continue;
      }

      const found = candidates($, resolved.examples);
      if ('error' in found)
        return finish({ status: 'unresolved', reason: `record rule: ${found.error}` });
      if (!found.options.length)
        return finish({ status: 'unresolved', reason: 'record rule: no candidates' });
      const examples = found.examples;
      // A record rule must find records on every page at this level.
      const pagesHtml = current.map((source, index) => (index === 0 ? $ : load(html(source))));
      const onEveryPage = found.options.filter((list) =>
        pagesHtml.every((p$) => p$(list.selector).length > 0),
      );
      const lists = distinctLists($, onEveryPage, read, examples, page.url);
      const chosen = pickList(lists, read.count);
      if (!chosen)
        return finish({
          status: 'unresolved',
          reason: 'no record rule keeps every example on every page of the level',
        });
      calls.event(`list-${depth}`, {
        type: 'chosen',
        options: lists.map((l) => l.count),
        selector: chosen.selector,
        count: chosen.count,
      });

      let ruleOf: Record<string, FoundRule | null> = chosen.fields;
      let required = chosen.required;
      const missing = Object.entries(ruleOf)
        .filter(([, rule]) => !rule)
        .map(([name]) => name);
      if (missing.length) {
        calls.event(`fields-${depth}`, { type: 'code-found-no-rule', missing });
        const answer = await askFieldRules({
          calls,
          $,
          records: chosen.records,
          examples,
          job: `fields-${depth}`,
          profile,
        });
        if (!answer) return finish({ status: 'unresolved', reason: 'field rules not found' });
        ruleOf = answer;
        required = requiredFields(examples, ruleOf);
      }
      const collects = (name: string) =>
        examples.some((e) => e[name]?.some((c) => c.kind === 'lines'));
      const fields: Record<string, FieldRule> = Object.fromEntries(
        Object.entries(ruleOf).flatMap(([name, rule]) =>
          rule ? [[name, collects(name) ? { ...rule, list: true as const } : { ...rule }]] : [],
        ),
      );
      const stage: RecordStage = {
        kind: 'records',
        format: 'html',
        render: rendering,
        selector: chosen.selector,
        fields,
        required,
        where: null,
        limit: read.limit ?? null,
      };
      stages.push(stage);

      const extract = (s: RecordStage): ExtractedRecord[] =>
        current.flatMap((source) => readRecords(source, s, signal));
      const records = extract(stage);
      const base = baseOf($, page.url);
      const cited = new Set(
        records.flatMap((r, i) =>
          examples.some((ex) => hasExample(r.fields, exampleValues(ex, $, base), ex)) ? [i] : [],
        ),
      );
      // On one page, a reader whose count is no more than the items it cited has cited every item.
      const citedAll = current.length === 1 && read.count !== null && read.count <= examples.length;
      const labels = await labelRecords({
        calls,
        instruction: task,
        records,
        cited,
        citedAll,
        concurrency: profile.jevConcurrency,
      });
      if (labels)
        calls.event(`members-${depth}`, {
          type: 'labels',
          keep: labels.filter((l) => l.keep).length,
          drop: labels.filter((l) => !l.keep).length,
          by: labels.map((l) => l.by),
        });
      // Code keeps the records that answer by one phrase when it finds one; the stage then selects only those.
      const where = labels ? findWhere(records, labels) : null;
      calls.event(`where-${depth}`, { type: 'where', where });
      if (where) stage.where = where;
      const kept = where ? extract(stage) : records;

      const schema = request.outputSchema ?? inferSchema(examples);
      const mapped = await writeProgram({
        calls,
        instruction: request.instruction,
        schema,
        records,
        kept,
        examples,
        $,
        base,
        labels,
        where: Boolean(where),
        fields,
        sampleBytes: profile.mappingSampleBytes,
        steps: profile.mappingSteps,
      });
      if (!mapped)
        return finish({
          status: 'unresolved',
          reason: 'mapping: no valid program',
          outputSchema: schema,
        });
      const findings = resultFindings({
        data: mapped.data,
        examples,
        $,
        base,
        records,
        read,
        onePage: current.length === 1,
        labels,
        fields,
      });
      return finish({
        status: 'ready',
        findings,
        program: mapped.program,
        outputSchema: schema,
        data: mapped.data,
      });
    }
  } catch (error) {
    if (error instanceof DiscoveryStop)
      return finish({
        status: error.kind === 'blocked' ? 'blocked' : 'unresolved',
        reason: error.message,
        stop: error,
      });
    throw error;
  }
};

// Field rules from the model, when code found none for some field: each must give every cited value in its record.
const askFieldRules = async ({
  calls,
  $,
  records,
  examples,
  job,
  profile,
}: {
  calls: Calls;
  $: CheerioAPI;
  records: import('domhandler').Element[];
  examples: Example[];
  job: string;
  profile: DiscoveryProfile;
}) => {
  const raw = (c: Example[string][number]) =>
    c.attribute
      ? ($(c.element).attr(c.attribute) ?? '')
      : $(c.element).text().replace(/\s+/g, ' ').trim();
  const exampleRecords = records.map((r, i) => ({
    html: clip($.html(r).replace(/\s+/g, ' '), profile.fieldRecordChars),
    values: Object.fromEntries(
      Object.entries(examples[i] ?? {}).map(([k, cited]) => [
        k,
        cited.length > 1 ? cited.map(raw) : raw(cited[0] as Example[string][number]),
      ]),
    ),
  }));
  return calls.agent<z.infer<typeof FieldsAnswerSchema>>({
    job,
    instructions: FIELDS_INSTRUCTIONS,
    schema: FieldsAnswerSchema,
    input: fieldsContext({ records: exampleRecords }),
    steps: profile.fieldSteps,
    validate: (answer) => {
      const problems: string[] = [];
      for (const [i, r] of records.entries()) {
        for (const [k, cited] of Object.entries(examples[i] ?? {})) {
          const rule = answer[k];
          if (!rule) {
            problems.push(`No rule for field ${k}.`);
            continue;
          }
          let found;
          try {
            found = hits($, r, rule.selector);
          } catch (error) {
            problems.push(`${k}: invalid selector (${(error as Error).message}).`);
            continue;
          }
          const want = cited.map((c) => valueOf($, c.element, c.attribute));
          const got = found.map((el) => valueOf($, el, rule.attribute));
          if (cited.length > 1) {
            const missed = cited.filter((_, j) => !got.includes(want[j] as string));
            if (missed.length)
              problems.push(
                `Record ${i + 1}, ${k}: the rule matches ${got.length} elements, but none of them gives these values: ${missed.map((c) => `"${clip(raw(c), 80)}"`).join(', ')}.`,
              );
          } else if (got[0] !== want[0])
            problems.push(
              `Record ${i + 1}, ${k}: the rule gives "${clip(got[0] ?? '', 120)}", it must give "${clip(raw(cited[0] as Example[string][number]), 120)}".`,
            );
        }
      }
      return problems.length ? problems.join('\n') : null;
    },
  });
};
