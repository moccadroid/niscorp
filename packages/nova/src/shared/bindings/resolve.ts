import { evaluateSafe } from '@niscorp/prism';
import { hasKey, isArray, isObject } from '../common';
import { getPath } from './paths';
import type { ScopeChain } from './types';

const TEMPLATE_REGEX = /\{\{\s*([^}]+?)\s*\}\}/g;
const SOLE_TEMPLATE_REGEX = /^\{\{\s*([^}]+?)\s*\}\}$/;
const BARE_PATH_REGEX = /^\$(\.|[A-Za-z_]|$)/;

export type ExtraScopes = Record<string, unknown>;

const matchExtra = (expression: string, extras: ExtraScopes): string | undefined => {
  let matched: string | undefined;
  for (const key of Object.keys(extras)) {
    if (expression === key || expression.startsWith(`${key}.`)) {
      if (matched === undefined || key.length > matched.length) matched = key;
    }
  }
  return matched;
};

const resolveExtraExpression = (
  expression: string,
  matchedKey: string,
  extras: ExtraScopes,
): unknown => {
  const root = extras[matchedKey];
  if (expression === matchedKey) return root;
  const rest = expression.slice(matchedKey.length + 1);
  if (rest.length === 0) return root;
  return getPath(root, rest);
};

const walkFromScopeHead = (head: unknown, restSegments: readonly string[]): unknown => {
  if (restSegments.length === 0) return head;
  return getPath(head, restSegments.join('.'));
};

export const resolvePath = (
  path: string,
  chain: ScopeChain,
  extras: ExtraScopes = {},
): unknown => {
  const extraKey = matchExtra(path, extras);
  if (extraKey !== undefined) return resolveExtraExpression(path, extraKey, extras);

  if (!path.startsWith('$')) return undefined;
  if (path === '$') return chain[0];

  const afterDollar = path.slice(1);

  if (afterDollar.startsWith('.')) {
    const rest = afterDollar.slice(1);
    if (rest.length === 0) return chain[0];
    const segments = rest.split('.');
    const head = segments[0];
    if (head === undefined) return undefined;
    for (const scope of chain) {
      if (hasKey(scope, head)) {
        return walkFromScopeHead(scope[head], segments.slice(1));
      }
    }
    return undefined;
  }

  const segments = afterDollar.split('.');
  const varName = segments[0];
  if (varName === undefined || varName.length === 0) return undefined;
  for (const scope of chain) {
    if (hasKey(scope, varName)) {
      return walkFromScopeHead(scope[varName], segments.slice(1));
    }
  }
  return undefined;
};

const stringify = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
};

const isTruthy = (value: unknown): boolean => {
  if (value === null || value === undefined) return false;
  if (value === false) return false;
  if (value === 0) return false;
  if (value === '') return false;
  if (isArray(value) && value.length === 0) return false;
  return true;
};

type Directive = (node: Record<string, unknown>, chain: ScopeChain, extras: ExtraScopes) => unknown;

const DIRECTIVES: Record<string, Directive> = {
  $if: (node, chain, extras) => {
    if (isTruthy(resolve(node.$if, chain, extras))) return resolve(node.$then, chain, extras);
    if (hasKey(node, '$else')) return resolve(node.$else, chain, extras);
    return undefined;
  },
  $eq: (node, chain, extras) => {
    const args = isArray(node.$eq) ? node.$eq : [];
    return resolve(args[0], chain, extras) === resolve(args[1], chain, extras);
  },
  $exists: (node, chain, extras) => resolve(node.$exists, chain, extras) !== undefined,
  $at: (node, chain, extras) => {
    const args = isArray(node.$at) ? node.$at : [];
    const arr = resolve(args[0], chain, extras);
    const index = Number(resolve(args[1], chain, extras));
    if (!isArray(arr) || Number.isNaN(index)) return undefined;
    const element = arr[index];
    const field = args[2];
    return field !== undefined && isObject(element) ? element[String(field)] : element;
  },
  $prism: (node, chain) => {
    const result = evaluateSafe(node.$prism, chain[0] ?? {});
    return result.ok ? result.data : undefined;
  },
};

const directiveOf = (value: Record<string, unknown>): Directive | undefined => {
  for (const key of Object.keys(value)) {
    const directive = DIRECTIVES[key];
    if (directive !== undefined) return directive;
  }
  return undefined;
};

const resolveString = (value: string, chain: ScopeChain, extras: ExtraScopes): unknown => {
  const sole = value.match(SOLE_TEMPLATE_REGEX);
  if (sole !== null) {
    const expr = sole[1];
    if (expr === undefined) return value;
    return resolvePath(expr.trim(), chain, extras);
  }

  if (value.includes('{{')) {
    return value.replace(TEMPLATE_REGEX, (_match: string, expression: string): string => {
      const resolved = resolvePath(expression.trim(), chain, extras);
      return stringify(resolved);
    });
  }

  if (BARE_PATH_REGEX.test(value)) {
    return resolvePath(value, chain, extras);
  }

  if (matchExtra(value, extras) !== undefined) {
    return resolvePath(value, chain, extras);
  }

  return value;
};

export const resolve = (
  value: unknown,
  chain: ScopeChain,
  extras: ExtraScopes = {},
): unknown => {
  if (typeof value === 'string') return resolveString(value, chain, extras);
  if (isArray(value)) return value.map((entry) => resolve(entry, chain, extras));
  if (isObject(value)) {
    const directive = directiveOf(value);
    if (directive !== undefined) return directive(value, chain, extras);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      out[key] = resolve(value[key], chain, extras);
    }
    return out;
  }
  return value;
};
