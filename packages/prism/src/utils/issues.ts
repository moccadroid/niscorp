import type { z } from 'zod';
import { formOf } from '../schemas/node.schema';

export type Explained = { path: (string | number)[]; message: string };

type Issue = z.core.$ZodIssue;

const segmentsOf = (path: readonly PropertyKey[]): (string | number)[] =>
  path.map((p) => (typeof p === 'number' ? p : String(p)));

const explainOne = (issue: Issue, prefix: (string | number)[]): Explained[] => {
  const here = [...prefix, ...segmentsOf(issue.path)];
  if (issue.code === 'invalid_key') return [{ path: here, message: issue.issues[0]?.message ?? issue.message }];
  if (issue.code !== 'invalid_union' || issue.errors.length === 0) return [{ path: here, message: issue.message }];
  let best: Explained[] = [];
  let bestDepth = -1;
  for (const branch of issue.errors) {
    const explained = branch.flatMap((i) => explainOne(i, here));
    const depth = Math.max(...explained.map((e) => e.path.length));
    // The branch that got furthest into the value is the one the config meant;
    // on a tie, fewer complaints is the closer match.
    if (depth > bestDepth || (depth === bestDepth && explained.length < best.length)) {
      best = explained;
      bestDepth = depth;
    }
  }
  return bestDepth <= here.length ? [{ path: here, message: 'Not a Prism node: no op matches, and it is not a plain value.' }] : best;
};

const valueAt = (value: unknown, path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>((at, key) => (typeof at === 'object' && at !== null ? Reflect.get(at, key) : undefined), value);

// The op an issue is about: the op of the node the issue is on, or the op whose
// own field it is on. An issue deeper down is about a node inside a field.
const opOf = (value: unknown, path: readonly (string | number)[]): string | undefined => {
  const last = path[path.length - 1];
  if (typeof last === 'string' && last.startsWith('$') && formOf(last) === undefined) return undefined;
  const here = valueAt(value, path);
  if (typeof here === 'object' && here !== null && !Array.isArray(here)) {
    const ops = Object.keys(here).filter((key) => formOf(key) !== undefined);
    if (ops.length === 1) return ops[0];
  }
  for (const back of [1, 2]) {
    const i = path.length - back;
    const key = path[i];
    if (typeof key !== 'string' || formOf(key) === undefined) continue;
    const holder = valueAt(value, path.slice(0, i));
    if (typeof holder === 'object' && holder !== null && Object.keys(holder).length === 1) return key;
  }
  return undefined;
};

const withForm = (explained: Explained, value: unknown): Explained => {
  const op = opOf(value, explained.path);
  const form = op === undefined ? undefined : formOf(op);
  return form === undefined ? explained : { ...explained, message: `${explained.message.replace(/\.$/, '')}. Form: ${form}` };
};

export const explainIssues = (issues: readonly Issue[], value: unknown): Explained[] =>
  issues.flatMap((i) => explainOne(i, [])).map((explained) => withForm(explained, value));

export const issuesText = (explained: readonly Explained[]): string =>
  explained.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ');
