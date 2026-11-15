import type { z } from 'zod';
import type { ValueKind } from './schema-walker';
import type { ParserEvent } from './types';
import { walkSchema, type SchemaInfo } from './schema-walker';
import { splitPath, getByPath } from './path';

const childPathOf = (containerPath: string, key: string): string =>
  containerPath === '' ? key : `${containerPath}.${key}`;

export type ValidationMode = 'trust' | 'recover' | 'strict';
export type ConstraintsMode = 'kind' | 'finalize';

export type StreamErrorPhase = 'value-open' | 'finalize';

export type StreamError = {
  path: string;
  expected: string;
  received: string;
  phase: StreamErrorPhase;
  message: string;
};

export type ValidatorDeps = {
  schema: z.ZodType;
  mode: ValidationMode;
  constraints: ConstraintsMode;
  emitError: (err: StreamError) => void;
  onFailed: () => void;
  getContainerKeys: (path: string) => readonly string[] | undefined;
  getChildIndex: (path: string, key: string) => number | undefined;
};

export type Validator = {
  valueOpen: (segments: readonly string[], kind: ValueKind) => 'accept' | 'skip';
  processEvents: (events: ParserEvent[], getRoot: () => unknown) => void;
  isFailed: () => boolean;
};

export const createValidator = (deps: ValidatorDeps): Validator => {
  let failed = false;
  const finalizeChecked = new Set<string>();
  // A key may have a dot in it, so a joined path cannot be split back into its keys.
  const containerSegments = new Map<string, readonly string[]>([['', []]]);
  // Keys of a container before this index have been checked.
  const checkedUpTo = new Map<string, number>();

  const valueOpen = (segments: readonly string[], kind: ValueKind): 'accept' | 'skip' => {
    if (deps.mode === 'trust') return 'accept';
    if (failed) return 'skip';

    const path = segments.join('.');
    const info = walkSchema(deps.schema, segments);

    if (!info) {
      reportValueOpen(path, '<unknown path>', kind, deps);
      if (deps.mode === 'strict') { failed = true; deps.onFailed(); }
      return 'skip';
    }

    if (!kindAccepted(info, kind)) {
      reportValueOpen(path, kindsLabel(info), kind, deps);
      if (deps.mode === 'strict') { failed = true; deps.onFailed(); }
      return 'skip';
    }

    if (kind === 'object' || kind === 'array') containerSegments.set(path, segments);
    return 'accept';
  };

  const segmentsOf = (containerPath: string): readonly string[] =>
    containerSegments.get(containerPath) ?? splitPath(containerPath);

  const finalizeField = (path: string, segments: readonly string[], getRoot: () => unknown): void => {
    if (failed) return;
    if (finalizeChecked.has(path)) return;
    finalizeChecked.add(path);

    const info = walkSchema(deps.schema, segments);
    if (!info || !info.subSchema) return;

    const value = getByPath(getRoot(), segments);
    if (value === undefined) return;

    const result = info.subSchema.safeParse(value);
    if (result.success) return;

    const issue = result.error.issues[0];
    deps.emitError({
      path,
      expected: kindsLabel(info),
      received: describeValue(value),
      phase: 'finalize',
      message: issue ? issue.message : 'constraint violation',
    });

    if (deps.mode === 'strict') { failed = true; deps.onFailed(); }
  };

  const finalizeSiblingsBefore = (containerPath: string, newKey: string, getRoot: () => unknown): void => {
    const keys = deps.getContainerKeys(containerPath);
    const end = deps.getChildIndex(containerPath, newKey);
    if (!keys || end === undefined) return;
    const start = checkedUpTo.get(containerPath) ?? 0;
    const base = segmentsOf(containerPath);
    for (let index = start; index < end; index += 1) {
      const key = keys[index];
      if (key === undefined) continue;
      finalizeField(childPathOf(containerPath, key), [...base, key], getRoot);
      if (failed) return;
    }
    checkedUpTo.set(containerPath, Math.max(start, end));
  };

  const finalizeAllChildren = (containerPath: string, getRoot: () => unknown): void => {
    const keys = deps.getContainerKeys(containerPath);
    if (!keys) return;
    const base = segmentsOf(containerPath);
    for (const key of keys) {
      finalizeField(childPathOf(containerPath, key), [...base, key], getRoot);
      if (failed) return;
    }
    finalizeField(containerPath, base, getRoot);
  };

  const processEvents = (events: ParserEvent[], getRoot: () => unknown): void => {
    if (deps.mode === 'trust') return;
    if (deps.constraints !== 'finalize') return;

    for (const ev of events) {
      switch (ev.type) {
        case 'enterKey':
          finalizeSiblingsBefore(ev.path, ev.key, getRoot);
          break;
        case 'enterIndex':
          finalizeSiblingsBefore(ev.path, String(ev.index), getRoot);
          break;
        case 'leaveObject':
        case 'leaveArray':
          finalizeAllChildren(ev.path, getRoot);
          break;
      }
      if (failed) return;
    }
  };

  const isFailed = (): boolean => failed;

  return { valueOpen, processEvents, isFailed };
};

const kindAccepted = (info: SchemaInfo, kind: ValueKind): boolean => {
  if (info.acceptedKinds === 'any') return true;
  return info.acceptedKinds.has(kind);
};

const kindsLabel = (info: SchemaInfo): string => {
  if (info.acceptedKinds === 'any') return 'any';
  return [...info.acceptedKinds].join(' | ');
};

const reportValueOpen = (
  path: string,
  expected: string,
  received: ValueKind,
  deps: ValidatorDeps,
): void => {
  deps.emitError({
    path,
    expected,
    received,
    phase: 'value-open',
    message: `[solid] ${path || '<root>'}: expected ${expected}, got ${received}`,
  });
};

const describeValue = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};
