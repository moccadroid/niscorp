# Code Style Guide

Rules for writing code in this codebase. Short, focused on what matters.

---

## TypeScript Strictness

- `strict: true` in tsconfig. Always.
- No `any`. Use `unknown` when the type is genuinely unknown, then narrow it.
- No type assertions (`as`, `as unknown as`). If you need to cast, the types are wrong. Fix them.
- No non-null assertions (`!`). Never. There is always a way to restructure the code so TypeScript can narrow without `!`. If you think you need it, you're wrong.
- No `enum`. Use `z.enum()` or `as const` objects.
- No classes unless you genuinely need identity + mutable state (almost never in these projects).
- No decorators, no `reflect-metadata`.

---

## Functions

- Arrow functions with `const`. No `function` declarations.
- Exported functions must have explicit return types.
- Internal functions can rely on inference.

```typescript
// yes
export const evaluate = (config: Config, source: JsonObject): JsonValue => { ... };

// no
export function evaluate(config: Config, source: JsonObject) { ... }
```

---

## Types

Types are written where they make sense. Not everything comes from Zod.

- **Zod-inferred types** for schemas that need runtime validation (DSL nodes, configs, API contracts, anything that crosses a boundary).
- **Hand-written types** for everything else: function parameters, return types, internal interfaces, options objects, dependency bags, runtime state, callbacks, etc.

```typescript
// Zod-inferred: this is a DSL node, needs runtime validation
export const RefNodeSchema = z.object({ $ref: z.string() }).strict();
export type RefNode = z.infer<typeof RefNodeSchema>;

// Hand-written: this is a function parameter bag, no validation needed
export type RendererConfig = {
  registry: ComponentRegistry;
  eventBus?: EventBus;
  layoutStore?: LayoutStore;
};

// Hand-written: this is a return type contract
export type LayoutRenderer = {
  render: (layout: LayoutNode, data: Record<string, unknown>) => React.ReactNode;
};
```

---

## Zod

- `.strict()` on object schemas that represent external input.
- `.describe()` on schemas and fields that will be consumed by LLMs or generate JSON Schema. Not on every internal helper schema.
- `safeParse` at boundaries (user input, API responses, LLM output). `parse` inside trusted code where failure means a bug.

### Never pretty-print JSON inside prompts

When embedding JSON (a schema, an example, a tool descriptor) into an LLM prompt, **always minify**. `JSON.stringify(value)` — no `null, 2`. Pretty-printing roughly doubles the token count for no benefit: the model parses minified JSON exactly as well, and the cost is paid on every call.

Pretty-printing is fine when the destination is a human (debug output, logs, the showroom inspector). For prompts, minify. If you genuinely need both — say, a `debug` flag that pretty-prints — name it explicitly and default to minified.

### Schemas are the single source of truth for LLM agents

When an LLM agent produces or consumes a typed shape, **the Zod schema is the one source of truth**. Do not duplicate schema knowledge into system prompts.

- **Every constraint goes on the Zod field via `.describe()`**: format rules, syntactic gotchas, examples, what each variant means. If a `$ref` field requires JSONPath syntax starting with `$.`, the `.describe()` says so. If a template uses `{{double}}` braces, the `.describe()` says so. The schema teaches the model how to fill it in.
- **Inject the JSON Schema at runtime**: agent system prompts use `z.toJSONSchema(schema, { target: 'draft-7' })` and embed the result. The system prompt itself stays minimal — agent role, output envelope, a placeholder where the schema lands, and one short worked example at most.
- **Never write a "here is how the DSL works" prose section in the system prompt.** Never maintain a hand-curated operations list alongside the schema. Both will drift from the schema and silently produce broken output. The author has been burned by this.
- **Apply this to all packages.** Cortex agents, Signal agents, future Vex agents, anything that talks to a model with a typed contract. The schema is the contract; the prompt is the convener.

The reason for the schemas in the first place is that the system becomes self-explanatory and we have ONE source of truth. Code that violates this is wrong — fix the schema's `.describe()` calls, not the prompt.

---

## Unused Parameters

Underscore prefix. Simple.

```typescript
const handler = (_event: Event, _from: Address) => { ... };
template.replace(TEMPLATE_REGEX, (_match: string, path: string) => { ... });
```

---

## File Naming

Kebab-case with dot notation to denote the file's role:

```
action-plan.schema.ts       # Zod schema definitions
postgres.adapter.ts          # Database adapter implementation
internal.types.ts            # Type definitions
event-bus.ts                 # Implementation (no role suffix needed for primary files)
query.agent.ts               # Agent implementation
scope.apply.ts               # Domain logic
```

The part before the last dot is the name, the part after is the role: `.schema.ts`, `.types.ts`, `.adapter.ts`, `.agent.ts`, `.test.ts`.

Plain `name.ts` is fine when the file's role is obvious from context or when it's the primary implementation file.

---

## Exports

- Named exports only. No default exports.
- Barrel `index.ts` files for each module directory.
- Root `index.ts` is the public API - be explicit about what's exported, don't `export *` from internal modules.
- Use `import type` for type-only imports.

---

## Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Files | `kebab-case.role.ts` | `action-plan.schema.ts` |
| Functions | `camelCase` | `createShell`, `evaluateNode` |
| Types/Interfaces | `PascalCase` | `LayoutNode`, `ShellConfig` |
| Constants | `UPPER_SNAKE_CASE` | `TEMPLATE_REGEX`, `DEFAULT_TIMEOUT` |
| Variables | `camelCase` | `currentValue`, `pendingRequests` |
| Booleans | `is`/`has`/`should` prefix | `isOptional`, `hasChildren` |
| Factories | `create` prefix | `createShell`, `createMessageBus` |
| Type guards | `is` prefix | `isComponentNode`, `isBinding` |

---

## Patterns

**Factory functions** for stateful objects. Return an explicit interface, not the whole closure:

```typescript
export const createMessageBus = (): MessageBus => {
  const subscribers: Subscriber[] = [];
  // ... private state
  const send = (msg: Message): void => { ... };
  const receive = (addr: Address, handler: Handler): Unsubscribe => { ... };
  return { send, receive };
};
```

**Subscriptions return cleanup functions:**

```typescript
const unsubscribe = bus.on('topic', handler);
// later
unsubscribe();
```

**Single config object** for function dependencies, not positional args:

```typescript
// yes
export const createShell = (config: ShellConfig, deps: ShellDeps): Shell => { ... };

// no
export const createShell = (config: ShellConfig, bus: MessageBus, reg: Registry, eb?: EventBus): Shell => { ... };
```

---

## Immutability

- Don't mutate function inputs. Spread to create new objects.
- `let` only when reassignment is genuinely necessary.
- `push` is fine in local accumulators inside pure functions. Not fine on external state.

---

## Error Handling

- Custom error classes with error codes and context for domain errors.
- `Result<T>` (`{ ok: true, data } | { ok: false, error }`) for functions where callers are expected to handle failure.
- Event/message handlers catch their own errors and log them - never crash the bus.

---

## Comments

- Explain **why**, not **what**. If the code needs a "what" comment, make the code clearer.
- Schema `.describe()` replaces JSDoc for anything that generates documentation.
- No JSDoc on functions unless the signature is genuinely ambiguous.
- No commented-out code. Git has history.
- Section headers (`// ═══` major, `// ───` minor) to organize large files.

---

## Build

- ESM source, dual ESM/CJS output via tsup.
- Target ES2022, Node >= 18.18.
- Minimal dependencies. Every dep must earn its place.
