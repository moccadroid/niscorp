import { PrismError, takeOrigin } from '../errors';
import { formOf } from '../schemas/node.schema';
import { isJsonObject } from '../schemas/guards';
import { desugar } from '../sugar/desugar';

const findPath = (tree: unknown, matches: (value: unknown) => boolean): string[] | undefined => {
  const at: string[] = [];
  const walk = (value: unknown): boolean => {
    if (matches(value)) return true;
    if (value === null || typeof value !== 'object') return false;
    for (const [key, child] of Object.entries(value)) {
      at.push(key);
      if (walk(child)) return true;
      at.pop();
    }
    return false;
  };
  return walk(tree) ? at : undefined;
};

const soleOpOf = (node: unknown): string | undefined => {
  if (!isJsonObject(node)) return undefined;
  const keys = Object.keys(node);
  return keys.length === 1 && keys[0] !== undefined && keys[0].startsWith('$') ? keys[0] : undefined;
};

const MARK = '\u0000prism-field:';

type Position = { path: string[]; sugar?: string };

// `sugar` is set when the path ends in what a sugar op is run as: in the part
// Prism added, or on one of the sugar op's own fields.

// The evaluated tree is the author's config with each sugar op rewritten. Where
// a sugar op's keys stop matching, a copy of it is rewritten with a marker in
// each field, and the marker that lands where the path goes names the field.
const authorPosition = (authored: unknown, treePath: readonly string[]): Position | undefined => {
  const path: string[] = [];
  let node = authored;
  let rest = treePath;
  let sugar: string | undefined;
  while (rest.length > 0) {
    const [key] = rest;
    if (key !== undefined && typeof node === 'object' && node !== null && Object.prototype.hasOwnProperty.call(node, key)) {
      path.push(key);
      node = Reflect.get(node, key);
      rest = rest.slice(1);
      sugar = undefined;
      continue;
    }
    const op = soleOpOf(node);
    if (op === undefined || !isJsonObject(node)) return undefined;
    const fields = node[op];
    const names = isJsonObject(fields) ? Object.keys(fields) : [];
    const rewritten = desugar({ [op]: Object.fromEntries(names.map((name) => [name, `${MARK}${name}`])) });
    const landed = names
      .map((name) => ({ name, at: findPath(rewritten, (value) => value === `${MARK}${name}`) }))
      .find(({ at }) => at !== undefined && at.every((segment, i) => rest[i] === segment));
    if (landed?.at === undefined || !isJsonObject(fields)) return { path: [...path, op], sugar: op };
    path.push(op, landed.name);
    node = fields[landed.name];
    rest = rest.slice(landed.at.length);
    sugar = op;
  }
  return sugar === undefined ? { path } : { path, sugar };
};

const pathText = (path: readonly string[]): string => (path.length === 0 ? '(root)' : path.join('.'));

export const placeError = (error: unknown, tree: unknown, authored?: unknown): void => {
  if (!(error instanceof PrismError)) return;
  const origin = takeOrigin(error);
  if (origin === undefined) return;
  const parts = [error.message];
  if (origin.detail !== undefined) parts.push(origin.detail());
  const tail = [origin.op, origin.field].filter((part): part is string => part !== undefined);
  let formOp = origin.op;
  const nodePath = findPath(tree, (value) => value === origin.node);
  if (nodePath !== undefined) {
    const treePath = [...nodePath, ...tail];
    const position: Position = authored === undefined ? { path: treePath } : (authorPosition(authored, treePath) ?? { path: treePath });
    if (position.sugar === undefined) parts.push(`At ${pathText(position.path)}.`);
    else {
      parts.push(`At ${pathText(position.path)}, in the ${origin.op ?? 'node'} that ${position.sugar} runs as.`);
      formOp = position.sugar;
    }
  }
  const form = origin.form && formOp !== undefined ? formOf(formOp) : undefined;
  if (form !== undefined) parts.push(`Form: ${form}`);
  error.message = parts.join(' ');
};
