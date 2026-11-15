import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type EnvKey = { name: string; message: string; required?: boolean };
export type EnvOption = { value: string; label: string; hint?: string; keys?: readonly EnvKey[] };
export type EnvChoice = { choose: string; message: string; options: readonly EnvOption[] };
export type EnvSpec = EnvKey | EnvChoice;

export type Docs = {
  is?: string;
  where?: readonly string[];
  runs?: readonly string[];
  decisions?: readonly string[];
  answered?: readonly string[];
  open?: readonly string[];
  order?: readonly string[];
};

export type Part = {
  package?: Readonly<Record<string, unknown>>;
  env?: readonly EnvSpec[];
  docs?: Docs;
};

export type Item = Part & {
  id: string;
  answers?: string;
  label?: string;
  hint?: string;
  usage?: string;
  summary?: string;
  default?: boolean;
  requires?: Readonly<Record<string, string>>;
  with?: Readonly<Record<string, Part>>;
};

export type Question = { id: string; message: string };

export type Catalog = { root: string; questions: readonly Question[]; items: readonly Item[] };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

const json = (path: string): unknown => {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`create-nisc: ${path} is not JSON — ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const isChoice = (spec: EnvSpec): spec is EnvChoice => 'choose' in spec;

type At = { file: string; field: string };
type Parse<T> = (value: unknown, at: At) => T;

const inside = (at: At, key: string | number): At => ({
  file: at.file,
  field: typeof key === 'number' ? `${at.field}[${key}]` : at.field === '' ? key : `${at.field}.${key}`,
});

const wrongShape = (at: At, what: string): never => {
  throw new Error(`create-nisc: in ${at.file}, ${at.field === '' ? 'the whole file' : at.field} ${what}`);
};

const text: Parse<string> = (value, at) => (typeof value === 'string' ? value : wrongShape(at, 'is not a string'));
const flag: Parse<boolean> = (value, at) => (typeof value === 'boolean' ? value : wrongShape(at, 'is not true or false'));
const object: Parse<Record<string, unknown>> = (value, at) => (isRecord(value) ? value : wrongShape(at, 'is not an object'));
const optional =
  <T>(parse: Parse<T>): Parse<T | undefined> =>
  (value, at) =>
    value === undefined ? undefined : parse(value, at);
const listOf =
  <T>(each: Parse<T>): Parse<T[]> =>
  (value, at) =>
    Array.isArray(value) ? value.map((entry, index) => each(entry, inside(at, index))) : wrongShape(at, 'is not a list');
const recordOf =
  <T>(each: Parse<T>): Parse<Record<string, T>> =>
  (value, at) =>
    Object.fromEntries(Object.entries(object(value, at)).map(([key, entry]) => [key, each(entry, inside(at, key))]));
const fieldsOf = <T>(value: unknown, at: At, read: (field: <F>(key: string, parse: Parse<F>) => F) => T): T => {
  const record = object(value, at);
  return read((key, parse) => parse(record[key], inside(at, key)));
};

const envKey: Parse<EnvKey> = (value, at) =>
  fieldsOf(value, at, (field) => ({ name: field('name', text), message: field('message', text), required: field('required', optional(flag)) }));
const envOption: Parse<EnvOption> = (value, at) =>
  fieldsOf(value, at, (field) => ({ value: field('value', text), label: field('label', text), hint: field('hint', optional(text)), keys: field('keys', optional(listOf(envKey))) }));
const envSpec: Parse<EnvSpec> = (value, at) =>
  isRecord(value) && value['choose'] !== undefined
    ? fieldsOf(value, at, (field) => ({ choose: field('choose', text), message: field('message', text), options: field('options', listOf(envOption)) }))
    : envKey(value, at);
const lines = optional(listOf(text));
const docs: Parse<Docs> = (value, at) =>
  fieldsOf(value, at, (field) => ({
    is: field('is', optional(text)),
    where: field('where', lines),
    runs: field('runs', lines),
    decisions: field('decisions', lines),
    answered: field('answered', lines),
    open: field('open', lines),
    order: field('order', lines),
  }));
const part: Parse<Part> = (value, at) =>
  fieldsOf(value, at, (field) => ({ package: field('package', optional(object)), env: field('env', optional(listOf(envSpec))), docs: field('docs', optional(docs)) }));
const item: Parse<Item> = (value, at) => ({
  ...part(value, at),
  ...fieldsOf(value, at, (field) => ({
    id: field('id', text),
    answers: field('answers', optional(text)),
    label: field('label', optional(text)),
    hint: field('hint', optional(text)),
    usage: field('usage', optional(text)),
    summary: field('summary', optional(text)),
    default: field('default', optional(flag)),
    requires: field('requires', optional(recordOf(text))),
    with: field('with', optional(recordOf(part))),
  })),
});
const question: Parse<Question> = (value, at) => fieldsOf(value, at, (field) => ({ id: field('id', text), message: field('message', text) }));

// The templates are ours, so a mistake in them is a bug: it is refused here with a sentence, before anything is written.
export const readCatalog = (root: string): Catalog => {
  const questions = listOf(question)(json(join(root, 'questions.json')), { file: 'questions.json', field: '' });
  const items: Item[] = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'item.json')))
    .map((entry) => {
      const file = `${entry.name}/item.json`;
      const value = json(join(root, file));
      if (!isRecord(value) || value['id'] !== entry.name) throw new Error(`create-nisc: ${file} must say "id": "${entry.name}"`);
      return item(value, { file, field: '' });
    });

  const asked = new Set(questions.map((q) => q.id));
  const known = new Set(items.map((item) => item.id));
  const answering = (question: string): Item[] => items.filter((item) => item.answers === question);
  for (const item of items) {
    if (item.answers !== undefined && !asked.has(item.answers)) throw new Error(`create-nisc: item "${item.id}" answers "${item.answers}", which questions.json does not ask`);
    if (item.answers !== undefined && item.label === undefined) throw new Error(`create-nisc: item "${item.id}" answers a question but has no label to offer`);
    for (const [question, wanted] of Object.entries(item.requires ?? {})) {
      if (!answering(question).some((other) => other.id === wanted)) throw new Error(`create-nisc: item "${item.id}" requires "${wanted}" for "${question}", which no item answering it is`);
    }
    for (const other of Object.keys(item.with ?? {})) if (!known.has(other)) throw new Error(`create-nisc: item "${item.id}" has a part for "${other}", which is no item`);
  }
  for (const question of questions) {
    const offered = answering(question.id);
    if (offered.length === 0) throw new Error(`create-nisc: nothing answers "${question.id}"`);
    if (offered.filter((item) => item.default === true).length !== 1) throw new Error(`create-nisc: exactly one item answering "${question.id}" is its default`);
  }
  return { root, questions, items };
};
