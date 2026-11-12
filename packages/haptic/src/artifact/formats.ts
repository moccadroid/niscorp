import { useNamespaces, type SelectReturnType } from 'xpath';
import { evaluate, type Config } from '@niscorp/prism';
import { z } from 'zod';
import { readXml, readXmlProfile } from '../readers/xml/index.js';
import { resolveAddress, selectHtml } from '../web/html.js';
import { readSourceBody, type HttpSource } from '../web/source.js';
import { fold } from './fold.js';
import type { Where, XmlRecordStage, XmlReferenceStage } from './schema.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type XmlRecord = { sourceUrl: string; text: string; fields: Record<string, Json> };
export type JsonRecord = { sourceUrl: string; document: Json };
export type References = { links: string[]; resources: string[] };

export class FormatError extends Error {
  constructor(
    readonly code: 'XML_XPATH' | 'JSON_PARSE' | 'REFERENCES' | 'MEDIA_TYPE',
    message: string,
  ) {
    super(message);
  }
}

const xmlProfile = readXmlProfile();

const select = (
  source: HttpSource,
  stage: Pick<XmlRecordStage, 'selector' | 'namespaces' | 'fields'>,
  signal: AbortSignal,
): XmlRecord[] => {
  const { document } = readXml(source, xmlProfile, signal);
  const query = useNamespaces(stage.namespaces);
  const run = (expression: string, node: globalThis.Node): SelectReturnType => {
    signal.throwIfAborted();
    try {
      return query(expression, node);
    } catch (error) {
      throw new FormatError('XML_XPATH', `${expression}: ${(error as Error).message}`);
    }
  };
  const selected = run(stage.selector, document);
  if (!Array.isArray(selected) || selected.some((node) => node.nodeType !== 1))
    throw new FormatError(
      'XML_XPATH',
      `${stage.selector}: the record selector must return elements`,
    );
  const text = (node: globalThis.Node) => String(run('string(.)', node));
  return selected.map((node) => ({
    sourceUrl: source.url,
    text: text(node).replace(/\s+/g, ' ').trim(),
    fields: Object.fromEntries(
      Object.entries(stage.fields).map(([name, expression]) => {
        const value = run(expression, node);
        if (Array.isArray(value)) return [name, value.map((item) => text(item))];
        if (
          typeof value === 'string' ||
          typeof value === 'boolean' ||
          (typeof value === 'number' && Number.isFinite(value))
        )
          return [name, value];
        throw new FormatError(
          'XML_XPATH',
          `${expression}: a field must give a node-set, string, boolean or number`,
        );
      }),
    ),
  }));
};

const present = (value: Json | undefined) =>
  Array.isArray(value)
    ? value.length > 0 && String(value[0] ?? '').trim() !== ''
    : value !== undefined && value !== null && String(value).trim() !== '';
const passes = (record: XmlRecord, where: Where | null) => {
  if (!where) return true;
  const value =
    where.in === 'text'
      ? record.text
      : [record.fields[where.in]]
          .flat()
          .filter((v) => v != null)
          .join(' ');
  return fold(value).includes(fold(where.contains));
};

// The records an XML stage yields on one page: required fields, then where, then the limit, as for HTML.
export const readXmlRecords = (
  source: HttpSource,
  stage: XmlRecordStage,
  signal: AbortSignal,
): XmlRecord[] => {
  const out: XmlRecord[] = [];
  for (const record of select(source, stage, signal)) {
    if (stage.limit && out.length >= stage.limit) break;
    if (stage.required.every((name) => present(record.fields[name])) && passes(record, stage.where))
      out.push(record);
  }
  return out;
};

export const readJsonRecord = (source: HttpSource): JsonRecord => {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(readSourceBody(source));
  } catch {
    throw new FormatError('JSON_PARSE', `${source.url} is not UTF-8`);
  }
  try {
    return { sourceUrl: source.url, document: JSON.parse(text) as Json };
  } catch (error) {
    throw new FormatError('JSON_PARSE', `${source.url}: ${(error as Error).message}`);
  }
};

const ReferencesSchema = z
  .object({ links: z.array(z.string()).optional(), resources: z.array(z.string()).optional() })
  .strict();

// The addresses a reference stage gives on one page: its program over the page's XML records or JSON document,
// resolved against the page.
export const readReferences = (
  source: HttpSource,
  stage: XmlReferenceStage | { format: 'json'; references: unknown },
  program: Config,
  signal: AbortSignal,
): References => {
  const input =
    stage.format === 'xml'
      ? { records: select(source, stage as XmlReferenceStage, signal) }
      : { document: readJsonRecord(source).document };
  let value: unknown;
  try {
    value = evaluate(program, input as never, { check: 'always' });
  } catch (error) {
    throw new FormatError(
      'REFERENCES',
      `the reference program failed: ${(error as Error).message}`,
    );
  }
  const parsed = ReferencesSchema.safeParse(value);
  if (!parsed.success)
    throw new FormatError(
      'REFERENCES',
      'the reference program must return { links?: [address], resources?: [address] }',
    );
  const resolve = (values: string[] = []) =>
    values.flatMap((v) => resolveAddress(v, source.url, 'utf-8') ?? []);
  return { links: resolve(parsed.data.links), resources: resolve(parsed.data.resources) };
};

// The file addresses an HTML resource rule names on one page.
export const readHtmlResources = (
  source: HttpSource,
  rule: { selector: string; attribute: string },
  signal: AbortSignal,
): string[] => {
  const selection = selectHtml(
    source,
    rule.selector,
    { file: { selector: ':scope', attribute: rule.attribute } },
    signal,
  );
  return selection.items.flatMap((item) =>
    (item.fields.file ?? []).flatMap((v) =>
      v ? (resolveAddress(v, selection.baseUrl, selection.encoding) ?? []) : [],
    ),
  );
};
