import { isObject } from '@shared/common';
import { LifecycleError, type LifecycleHook } from '@shared/errors';
import type { ActionDefinition } from '../schemas';
import type { TransformFn } from '../types';
import { executeSteps, type StepContext } from './steps';

export const buildInitialData = (
  definition: ActionDefinition,
  input: Record<string, unknown> | undefined,
  transform: TransformFn | undefined,
): Record<string, unknown> => {
  const defaults = definition.data ?? {};
  // Deep-clone up front so the runtime owns an isolated data tree:
  // neither `definition.data` nor the caller's `input` can be mutated
  // by later in-place mutations, and `transform` receives a copy it
  // can freely mutate without leaking into caller-owned state.
  const merged: Record<string, unknown> = structuredClone({
    ...defaults,
    ...(input ?? {}),
  });
  if (transform === undefined) return merged;
  const transformed = transform({ pass: true }, merged);
  // Clone the transform output too — user code may return an object that
  // shares references with its own closure state; isolate it here.
  if (isObject(transformed)) return structuredClone(transformed);
  return merged;
};

export const runLifecycleHook = async (
  hook: LifecycleHook,
  definition: ActionDefinition,
  buildContext: () => StepContext,
): Promise<void> => {
  const lifecycle = definition.lifecycle;
  if (lifecycle === undefined) return;
  const steps = lifecycle[hook];
  if (steps === undefined || steps.length === 0) return;
  const ctx: StepContext = { ...buildContext(), lifecycleHook: hook };
  try {
    await executeSteps(steps, ctx);
  } catch (err) {
    if (!ctx.strict) {
      ctx.onError(
        err instanceof LifecycleError
          ? err
          : new LifecycleError(
              err instanceof Error ? err.message : String(err),
              { hook },
              { cause: err },
            ),
      );
      return;
    }
    if (err instanceof LifecycleError) throw err;
    throw new LifecycleError(
      err instanceof Error ? err.message : String(err),
      { hook },
      { cause: err },
    );
  }
};
