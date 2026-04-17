# Feature: Function Endpoints (`fn` variant of `EndpointConfig`)

**Status:** Not started
**Driven by:** Alchemist experience (`apps/lab/src/experiences/alchemist/DESIGN.md`)
**Audience:** Implementor. This file has everything you need.

---

## Summary

Widen `EndpointConfig` into a discriminated union with two variants:

- **HTTP (existing):** `{ url, method, body?, headers?, target?, errorTarget?, transform? }` — invoked via `fetch`.
- **Function (new):** `{ fn, target?, errorTarget? }` — invoked via a shell-level handler registry.

The `call` step, success/error plumbing, target/errorTarget, `@error` scope, and abort semantics are unchanged. `call` dispatches both. This is a widening of an existing concept, not a new mechanism.

---

## Why

Nova's `call` effect only reaches HTTP. For the Alchemist (and future experiences), the action needs to invoke local code — AI pipelines, DB queries, computations. The only current escape is the message bus, which breaks out of the step model (no `onSuccess`/`onError`, no abort propagation, no declarative intent in the action).

Endpoints and functions are the same shape with different transport: named descriptor → awaits a result → writes to `target` or runs `onError`. Splitting them into parallel systems duplicates schema, execution, and error handling. Widening the descriptor reuses every piece.

---

## API

### Endpoint config becomes a discriminated union

**File:** `src/action/schemas/endpoints.ts`

```ts
import { z } from 'zod';

const HttpEndpointSchema = z
  .object({
    url: z.string().describe('Template URL, e.g. "/api/users/{{$.userId}}".'),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).describe('HTTP method.'),
    headers: z.record(z.string(), z.string()).optional().describe('Static request headers.'),
    body: z
      .union([z.string(), z.record(z.string(), z.unknown())])
      .optional()
      .describe('Request body; templates are resolved.'),
    target: z.string().optional().describe('Data path to store the response at on success.'),
    errorTarget: z.string().optional().describe('Data path to store the error at on failure.'),
    transform: z
      .unknown()
      .optional()
      .describe('Optional Prism-style transform config applied to the response.'),
  })
  .strict()
  .describe('A named HTTP call with template URL, body, and response targeting.');

const FunctionEndpointSchema = z
  .object({
    fn: z
      .string()
      .describe(
        'Key of a function registered in `ShellConfig.functions`. The author is ' +
          'responsible for ensuring the name is registered; referencing an unregistered ' +
          '`fn` behaves like referencing an unknown endpoint (runs `onError` with @error, ' +
          'raises `LifecycleError` inside a lifecycle hook, or `UnknownFunctionError` in ' +
          'strict mode with no `onError`).',
      ),
    target: z.string().optional().describe('Data path to store the return value at on success.'),
    errorTarget: z.string().optional().describe('Data path to store the error at on failure.'),
  })
  .strict()
  .describe('A named local function call. Handler is provided via `ShellConfig.functions`.');

export const EndpointConfigSchema = z
  .union([HttpEndpointSchema, FunctionEndpointSchema])
  .describe('An endpoint — either an HTTP call or a local function.');

export type EndpointConfig = z.infer<typeof EndpointConfigSchema>;
```

`EndpointConfig` is inferred from the zod union — no hand-authored type.

### Function handler signature

**File:** `src/action/types.ts`

```ts
export type FunctionHandler = (
  data: Record<string, unknown>,
  signal: AbortSignal,
) => Promise<unknown>;
```

- **`data`** — Snapshot of the action's data store at call time (same snapshot passed to endpoint template resolution).
- **`signal`** — Propagated from the action runtime's abort controller. Mirrors how fetch receives it. If the handler ignores the signal, the step chain waits for its promise to resolve — same contract as ignoring abort in a fetch call. Author's problem to respect.
- **Return value** — Resolved value is written to `target` (if specified). Throw/reject to run `onError` with `@error` bound.

No `ctx` object, no mutation access. Handlers are pure `(data, signal) => Promise<value>`.

### Shell config gains a `functions` registry

**File:** `src/shell/types.ts`

```ts
export type ShellConfig = {
  // ...existing...
  functions?: Record<string, FunctionHandler>;
};
```

Registration example:

```ts
const shell = createShell({
  canvases: [{ id: 'main' }],
  actions: { workspace: workspaceAction },
  fetch,
  functions: {
    'run-transform': async (data, signal) => {
      const res = await someAiPipeline(data, { signal });
      return res.result;
    },
  },
});
```

### Authoring an action

```ts
const workspaceAction: ActionDefinition = {
  id: 'workspace',
  data: { status: 'idle', result: null, error: null },
  endpoints: {
    'save-user':     { url: '/users', method: 'POST', body: '{{$.data}}', target: 'result' },
    'run-transform': { fn: 'run-transform',                                target: 'result', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'transform-btn',
      do: [
        { set: 'status', value: 'running' },
        {
          call: 'run-transform',
          onSuccess: [{ set: 'status', value: 'done' }],
          onError: [
            { set: 'status', value: 'error' },
            { set: 'error', value: '{{@error.message}}' },
          ],
        },
      ],
    },
  ],
};
```

The `call` step shape is identical regardless of which variant the endpoint resolves to.

---

## Implementation

### 1. Thread `functions` through shell → runtime → step context

| File | Change |
|------|--------|
| `src/action/types.ts` | Add `FunctionHandler`; add `functions?: Record<string, FunctionHandler>` to `ActionRuntimeConfig` |
| `src/action/runtime/runtime.ts` | Include `functions: config.functions ?? {}` in `buildContext` (~line 58) |
| `src/action/runtime/steps.ts` | Add `functions: Record<string, FunctionHandler>` to `StepContext` (~line 20) |
| `src/shell/types.ts` | Add `functions?` to `ShellConfig` |
| `src/shell/shell-internals.ts` | Add `functions?` to `RuntimeFactoryDeps`; forward in `createRuntimeFactory` |
| `src/shell/shell.ts` | Forward `config.functions` into `createRuntimeFactory` (~line 137) |

### 2. Dispatch inside `callEndpoint`

**File:** `src/action/runtime/endpoints.ts`

Split the existing body into `callHttpEndpoint` (unchanged logic) and add `callFunctionEndpoint`. `callEndpoint` branches on the shape:

```ts
export type CallEndpointOptions = {
  endpoint: EndpointConfig;
  data: Record<string, unknown>;
  fetch?: FetchFn;
  transform?: TransformFn;
  signal?: AbortSignal;
  functions?: Record<string, FunctionHandler>;
};

export const callEndpoint = async (
  options: CallEndpointOptions,
): Promise<EndpointResult> => {
  if ('fn' in options.endpoint) return callFunctionEndpoint(options.endpoint, options);
  return callHttpEndpoint(options.endpoint, options);
};

const callFunctionEndpoint = async (
  endpoint: Extract<EndpointConfig, { fn: string }>,
  { data, signal, functions }: CallEndpointOptions,
): Promise<EndpointResult> => {
  const handler = functions?.[endpoint.fn];
  // Unknown-function arm is handled in `runCall` *before* dispatch (so it can raise
  // UnknownFunctionError in strict mode with no onError). We don't expect to reach
  // here with a missing handler in practice, but guard defensively.
  if (handler === undefined) {
    return {
      ok: false,
      error: { status: 0, message: `unknown function: ${endpoint.fn}`, data: undefined },
    };
  }

  try {
    const result = await handler(data, signal ?? new AbortController().signal);
    if (signal?.aborted === true) {
      return { ok: false, error: { status: 0, message: 'aborted', data: undefined, aborted: true } };
    }
    return { ok: true, data: result, status: 0 };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    const message = err instanceof Error ? err.message : 'function failed';
    if (isAbort) return { ok: false, error: { status: 0, message, data: undefined, aborted: true } };
    return { ok: false, error: { status: 0, message, data: undefined } };
  }
};
```

Result shape is identical to HTTP (`EndpointResult`). Downstream plumbing in `runCall` — `writeTarget`, `errorTarget`, `@error` scope, `onSuccess`/`onError` branching, lifecycle error propagation — is reused untouched. Function results report `status: 0`.

### 3. Unknown-function pre-check in `runCall`

**File:** `src/action/runtime/steps.ts`

`runCall` already has an unknown-endpoint arm (`endpoint === undefined`). Add a parallel arm for an unknown function, before dispatch, so strict mode can raise `UnknownFunctionError`:

```ts
const endpoint = ctx.endpoints[callName];
if (endpoint === undefined) { /* existing unknown-endpoint path */ }

if ('fn' in endpoint && ctx.functions[endpoint.fn] === undefined) {
  if (onError) {
    const errorExtras: ExtraScopes = {
      ...ctx.extras,
      '@error': { message: `unknown function: ${endpoint.fn}`, status: 0 },
    };
    await executeSteps(onError, { ...ctx, extras: errorExtras });
    return;
  }
  if (ctx.lifecycleHook !== undefined) {
    throw new LifecycleError(`unknown function: ${endpoint.fn}`, { hook: ctx.lifecycleHook });
  }
  if (ctx.strict) throw new UnknownFunctionError(endpoint.fn);
  return;
}

const result = await callEndpoint({
  endpoint,
  data: ctx.dataStore.get(),
  fetch: ctx.fetch,
  transform: ctx.transform,
  signal: ctx.signal,
  functions: ctx.functions,
});
// ...existing success/error handling is unchanged...
```

This mirrors the existing unknown-endpoint arms exactly, with a new error class on the strict surface.

### 4. Error class

**File:** `src/shared/errors.ts`

Add alongside `UnknownActionError`:

```ts
export const ErrorCodes = {
  // ...existing...
  unknownFunction: 'UNKNOWN_FUNCTION',
} as const;

export type UnknownFunctionContext = NovaErrorContext & { name: string };

export class UnknownFunctionError extends NovaError {
  constructor(name: string, options?: { cause?: unknown }) {
    super(
      ErrorCodes.unknownFunction,
      `Unknown function: "${name}". Is it registered in shell config's \`functions\` map?`,
      { name },
      options,
    );
    this.name = 'UnknownFunctionError';
  }
}
```

Re-export from `src/shared/index.ts`.

### 5. Public exports

**File:** `src/index.ts`

Add to the existing re-export blocks:

- **value:** `UnknownFunctionError`
- **type:** `FunctionHandler`, `UnknownFunctionContext`

`EndpointConfig` is already exported; the union widening propagates automatically.

---

## Testing

**File:** `test/action/runtime/function-endpoints.test.ts` (new)

- **Basic invocation** — `fn`-variant endpoint returns a value; `target` receives it; `onSuccess` runs.
- **Error branching** — handler throws; `errorTarget` receives the error; `onError` runs with `@error.message` bound.
- **Unknown function name** — no handler for `fn: 'x'`:
  - with `onError` → runs with `@error.message` containing "unknown function"
  - inside a lifecycle hook → `LifecycleError`
  - in strict mode with no `onError` → `UnknownFunctionError`
- **Abort propagation** — unmounting the action aborts the signal the handler receives; handlers that honor it return promptly, and the step chain exits on the existing `ctx.signal.aborted` check in `runCall`.
- **Abort while handler ignores signal** — chain waits for the promise; no mutations occur after the signal fires (already guaranteed by the existing `signal.aborted` guard in `runCall`).
- **Schema acceptance** — `{ fn: 'x' }` validates; `{ url: '/x', method: 'GET' }` still validates; an object with both `url` and `fn` fails validation (zod union rejects under `.strict()`).
- **Coexistence** — an action with both HTTP and function endpoints in the same map works; `call` dispatches each correctly.

---

## Files to modify

| File | Change |
|------|--------|
| `src/action/schemas/endpoints.ts` | `EndpointConfigSchema` becomes `z.union(HttpEndpointSchema, FunctionEndpointSchema)`; `EndpointConfig` inferred from the union |
| `src/action/runtime/endpoints.ts` | Split into `callHttpEndpoint` + `callFunctionEndpoint`; `callEndpoint` dispatches on `'fn' in endpoint`; accept `functions` in options |
| `src/action/runtime/steps.ts` | Add `functions` to `StepContext`; add unknown-function pre-check arm in `runCall`; pass `functions` into `callEndpoint` |
| `src/action/runtime/runtime.ts` | Include `functions: config.functions ?? {}` in `buildContext` |
| `src/action/types.ts` | Add `FunctionHandler`; add `functions?` to `ActionRuntimeConfig` |
| `src/shell/types.ts` | Add `functions?: Record<string, FunctionHandler>` to `ShellConfig` |
| `src/shell/shell-internals.ts` | Add `functions?` to `RuntimeFactoryDeps`; forward in `createRuntimeFactory` |
| `src/shell/shell.ts` | Forward `config.functions` into the factory |
| `src/shared/errors.ts` | Add `UnknownFunctionError`, error code, context type |
| `src/shared/index.ts` | Re-export the new error + context |
| `src/index.ts` | Re-export `UnknownFunctionError`, `FunctionHandler`, `UnknownFunctionContext` |

## Files to create

| File | Content |
|------|---------|
| `test/action/runtime/function-endpoints.test.ts` | Test suite from section above |

---

## What does NOT change

- **`call` step shape.** Unchanged. Steps don't care which variant they dispatch to.
- **`@error` scope shape.** `{ message, status, data?, aborted? }` for both variants. Function errors report `status: 0`.
- **Abort semantics.** Identical to fetch — handler receives the signal; if it ignores, the chain waits.
- **`onSuccess`/`onError` branching.** Inherited from existing `runCall`.
- **Mutation model.** Handlers cannot mutate state directly. They return; Nova writes the result to `target`. Intermediate/streaming updates are out of scope of this feature.
- **React adapter, layout, navigation, message bus, triggers.** Untouched.

---

## Design decisions

### Why unify rather than add a new step type?

Endpoints and functions are structurally the same: named descriptor, target/errorTarget, onSuccess/onError, abort-aware. Splitting them into parallel systems duplicates schema, execution, and error plumbing. Widening the descriptor reuses every piece — smaller surface, same semantics.

### Why a pure `(data, signal) => value` handler?

Giving handlers mutation access (`ctx.update`) reintroduces concurrency, lifetime, and staleness questions (post-return writes, concurrent invocations, shallow-vs-path merge semantics). A pure handler has none of them. If streaming/intermediate data is needed later, it's a separate feature on a different primitive — not bolted onto this one.

### Why `fn` and not `function`/`invoke`?

`fn` is compact, parallels `url` in the same descriptor, and reads cleanly. `function` is a reserved word in some contexts. `invoke` was the old name when functions were a separate step type — vestigial under the unified design.

### What guarantees that `fn: 'x'` points to a registered handler?

Nothing at validation time — the schema only checks that `fn` is a string. The author is responsible for ensuring the handler is registered on the shell. Unregistered-name behavior mirrors unknown-endpoint behavior exactly (onError+@error, LifecycleError in hooks, `UnknownFunctionError` in strict mode). This matches how endpoints already work: nothing stops an HTTP endpoint from pointing at a 404 URL until runtime.
