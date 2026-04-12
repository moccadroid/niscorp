import type { z } from 'zod';
import type { ValueKind } from './schema-walker';
import type { ParserEvent } from './types';
import { walkSchema, type SchemaInfo } from './schema-walker';
import { splitPath, getByPath } from './path';

// ═══════════════════════════════════════════════════════════
// Validator — enforces the structural invariant during streaming.
//
// Two phases:
//
//   value-open  — kind check the moment a value's type is known.
//                 Always on (when mode != trust).
//                 O(1) per value: schema lookup + Set.has.
//
//   finalize    — full sub-schema safeParse when a path closes.
//                 Opt-in via constraints: 'finalize'.
//                 Catches .min/.max/.regex/.refine.
//
// Three modes:
//
//   trust       — no validation. Today's behavior. Debug only.
//   recover     — emit error, fall back to prior valid value, keep going.
//   strict      — emit error, mark stream failed; no further updates.
// ═══════════════════════════════════════════════════════════

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
};

export type Validator = {
  valueOpen: (path: string, kind: ValueKind) => 'accept' | 'skip';
  processEvents: (events: ParserEvent[], getRoot: () => unknown) => void;
  isFailed: () => boolean;
};

// ───────────────────────────────────────────────────────────

export const createValidator = (deps: ValidatorDeps): Validator => {
  let failed = false;
  const finalizeChecked = new Set<string>();

  const valueOpen = (path: string, kind: ValueKind): 'accept' | 'skip' => {
    if (deps.mode === 'trust') return 'accept';
    if (failed) return 'skip';

    const segments = splitPath(path);
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

    return 'accept';
  };

  const finalizeField = (path: string, getRoot: () => unknown): void => {
    if (failed) return;
    if (finalizeChecked.has(path)) return;
    finalizeChecked.add(path);

    const segments = splitPath(path);
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
    if (!keys) return;
    for (const key of keys) {
      if (key === newKey) break;
      const childPath = containerPath === '' ? key : `${containerPath}.${key}`;
      finalizeField(childPath, getRoot);
      if (failed) return;
    }
  };

  const finalizeAllChildren = (containerPath: string, getRoot: () => unknown): void => {
    const keys = deps.getContainerKeys(containerPath);
    if (!keys) return;
    for (const key of keys) {
      const childPath = containerPath === '' ? key : `${containerPath}.${key}`;
      finalizeField(childPath, getRoot);
      if (failed) return;
    }
    finalizeField(containerPath, getRoot);
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

// ───────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────

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
