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

// The templates are ours, so a mistake in them is a bug: it is refused here with a sentence, before anything is written.
export const readCatalog = (root: string): Catalog => {
  const questions = json(join(root, 'questions.json'));
  if (!Array.isArray(questions) || !questions.every((q) => isRecord(q) && typeof q['id'] === 'string' && typeof q['message'] === 'string')) {
    throw new Error(`create-nisc: ${root}/questions.json is not a list of { id, message }`);
  }
  const items: Item[] = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, 'item.json')))
    .map((entry) => {
      const item = json(join(root, entry.name, 'item.json'));
      if (!isRecord(item) || item['id'] !== entry.name) throw new Error(`create-nisc: ${entry.name}/item.json must say "id": "${entry.name}"`);
      return item as Item;
    });

  const asked = new Set((questions as Question[]).map((q) => q.id));
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
  for (const question of questions as Question[]) {
    const offered = answering(question.id);
    if (offered.length === 0) throw new Error(`create-nisc: nothing answers "${question.id}"`);
    if (offered.filter((item) => item.default === true).length !== 1) throw new Error(`create-nisc: exactly one item answering "${question.id}" is its default`);
  }
  return { root, questions: questions as Question[], items };
};
