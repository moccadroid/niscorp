# Nova — Implementation Context

Read DESIGN.md for what to build. Read this for what NOT to do and why.

---

## Hard-Won Decisions

### Why RenderNode instead of direct React.createElement

We considered going straight to React elements. The problem: testing. If the renderer produces React elements, every layout test needs React test infrastructure. With RenderNode, the entire layout engine (bindings, scope chains, conditionals, loops, refs) is testable with plain vitest assertions on a simple JSON-like tree. React is only needed for the ~200 line adapter and the component tests.

Secondary benefit: the same core could power a Vue adapter. We don't need that now, but the architecture doesn't prevent it.

### Why "Mutations" not "Skills" or "Ops"

We went through several names. "Skills" was the neon-ui term — too vague, doesn't say what they do. "Ops" was considered — too generic, could mean anything. "DataOps" — clunky. "Mutations" is what they are: they mutate the action's data model. The name is honest.

### Why `do: Step[]` instead of separate fields

Early design had `ops`, `call`, `navigate`, `emit` as separate fields on a trigger. The problem: ordering. Real workflows need "set loading → call API → set result → navigate." With separate fields, you can't express "mutation, then effect, then mutation." The `do` array solves this — steps execute in order, mutations and effects interleave.

### Why `call` has `onSuccess`/`onError` but nothing else branches

We considered adding general-purpose conditionals to the step system. Rejected — it would turn the action DSL into a programming language. The only place branching is genuinely needed is API calls (which can fail). Everything else is sequential. This covers 99% of real use cases.

### Why no `onComplete`/`onCancel`

These were on the action definition in neon-ui. The problem: they encode user intent ("this action finished" vs "user cancelled") in the lifecycle, but the lifecycle doesn't know user intent. The trigger that causes unmount knows: a "Submit" button trigger does `{ push: { action: 'next' } }`, a "Cancel" button trigger does `{ pop: true }`. Navigation belongs in the trigger, not the lifecycle.

Lifecycle events are now pure state machine transitions: mount, unmount, suspend, resume. No invented concepts.

### Why four lifecycle events, not six

We considered adding "complete" and "cancel" alongside mount/unmount/suspend/resume. Rejected — "complete" and "cancel" are reasons for unmounting, not separate lifecycle events. An action unmounts because a trigger told it to. The trigger already carries the navigation intent. The lifecycle's `unmount` hook runs cleanup regardless of why.

### Why `data` not `initialData` with variants

neon-ui had `initialData: { type: 'static' | 'input' | 'mapped', ... }`. Three discriminated variants for something simple: the action has default data, and it receives input when pushed. Merge them. `{ ...definition.data, ...input }`. If you need to transform input, use the injected transform function (Prism). No special config needed.

### Why one trigger schema instead of 11

neon-ui had PopTrigger, PushTrigger, ResetTrigger, EndpointTrigger, SkillTrigger, EmitTrigger, RemoveTrigger, MessageSkillTrigger, MessageEndpointTrigger, MessagePushTrigger, MessagePopTrigger. 11 schemas with 15 type guards. All for "when X happens, do Y."

One schema: `{ event?, message?, ref?, do: Step[] }`. Source + match + steps. The steps contain the mutations, endpoint calls, navigation, and emit. No type guards needed — the step union handles dispatch.

### Why transform injection, not Prism dependency

Nova must work without Prism installed. But data transformation is valuable: reshape endpoint responses, transform input on mount. Solution: Nova accepts an optional `TransformFn = (config: unknown, source: Record<string, unknown>) => unknown`. If you pass `evaluate` from `@niscorp/prism`, transformation works. If you don't, features that need it are unavailable. Zero import, zero coupling.

---

## Mistakes to Avoid

### Don't use classes
Signal was originally built with a `class Signal<T>`. It was rewritten to a factory function. Follow the pattern from prism and signal: factory functions returning plain objects from closures. The STYLE_GUIDE.md is explicit about this.

### Don't use non-null assertions (`!`)
Signal had `config.schema!` after boolean checks. TypeScript can't narrow from `!!config.schema` to "schema is defined." The fix: destructure into a local variable and use control flow that TS can narrow. Or restructure so the code path guarantees the value exists. There is ALWAYS another way.

### Don't hand-write types
Every definition that crosses a boundary must be a Zod schema with `.describe()` on every field. Types are inferred via `z.infer<>`. This was drilled repeatedly. The JSON Schema generation (`z.toJSONSchema()`) depends on it. LLMs consume these schemas to generate valid layouts and action definitions.

### Don't use `zod-to-json-schema`
Zod 4's native `z.toJSONSchema()` works perfectly with recursive schemas. We tested it on Prism's NodeSchema (40+ op union with lazy refs). It produces correct JSON Schema with `$ref` self-references, `$defs`, all descriptions. Zero extra deps needed.

### Don't make the renderer framework-specific
The renderer produces `RenderNode[]`. The React adapter converts those to React elements. Keep the boundary clean. The renderer should NEVER import React.

### Don't put navigation in lifecycle
Navigation (push/pop/replace) belongs in triggers. Lifecycle hooks (mount/unmount/suspend/resume) run cleanup and initialization. If you feel like lifecycle needs navigation, you're thinking about it wrong — the trigger that causes the state transition carries the navigation.

---

## Reference Code

neon-ui source at `c:/Users/manxx/Development/ai/Archive/neon-ui/src` — NOT the `demo/` folder.

Study these for algorithmic reference (how binding resolution works, how scope chains compose, how the event bus routes). DO NOT copy code — the architecture is different and we need the code to be genuinely new.

Prism and Signal in `packages/prism/` and `packages/signal/` — study for style, patterns, and testing approach. Both follow the style guide and were reviewed thoroughly.
