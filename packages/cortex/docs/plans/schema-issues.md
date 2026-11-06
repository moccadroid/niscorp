# Schema refusals that name the real mistake

Status: approved by the owner on 2026-11-06 and built. Written on the branch `claude/prism-errors-536485`, after the Prism error work, and reviewed once.

## The problem

When a model's output or a tool call's arguments fail their zod schema, cortex turns zod's issues into the text the model is sent back. That text is all the model has to fix its next try. Two places write it:

1. **Output** (`schemas/envelope.schema.ts:123`) goes through `flattenSchemaIssues` (`utils/schema-issues.ts`), which follows a failed union into one branch and reports that branch's issues.
2. **Tool arguments** (`loop/loop.ts:261`) print zod's top-level issues as they are. A failed union is one issue with an empty message trail: `Invalid input`, with no field named.

Both places print a bad record key the way zod words its outer issue, `Invalid key in record`, and drop the reason zod keeps inside it.

Run against the built packages, as the model receives it:

| Input | Sent today |
|---|---|
| nova layout, a leaf child with a key `label` it does not take, as a **tool argument** | `: Invalid input` |
| nova step `{ push: { canvas, input } }` with no `action`, as a tool argument | `: Invalid input` |
| a tagged union (`kind: "chart" \| "table"`), a chart with no `title`, as a tool argument | `: Invalid input` |
| the same three as **output** | `data.children.0: Unrecognized key: "label"`, `data.push: Invalid input: expected string, received object`, `data.title: Invalid input: expected string, received undefined` |
| a record whose keys must be lower-case letters, given `{ "Good": 1 }`, as output | `data.Good: Invalid key in record` |
| a Prism op name that does not exist, `{ "x": { "$first": … } }`, Prism of `main` | `data.x.$first: Invalid key in record` |

So a tool call is told less than an output for the same mistake, and a record key's own rule never reaches the model.

## The proposal

**Tool arguments go through `flattenSchemaIssues`, as output does, and `flattenSchemaIssues` reports a record key's own reason.** How a branch is chosen does not change.

1. `loop/loop.ts:261` formats tool-argument issues with `flattenSchemaIssues`.
2. In `flattenSchemaIssues`, an `invalid_key` issue from a record is replaced by the issue nested in it, at the key's path.

Run outside the repository (the function with step 2 added, and the loop's formatting applied to it):

| Input | Today | Proposed |
|---|---|---|
| nova leaf with `label`, tool argument | `: Invalid input` | `children.0: Unrecognized key: "label"` |
| tagged union, chart with no `title`, tool argument | `: Invalid input` | `title: Invalid input: expected string, received undefined` |
| nova `push` with no `action`, tool argument | `: Invalid input` | `push: Invalid input: expected string, received object` |
| record key `Good`, output | `data.Good: Invalid key in record` | `data.Good: keys are lower-case letters` |
| cortex's three `schema-issues` tests | — | unchanged |

## Cost

- **Code:** one line in `loop/loop.ts`, one condition in `utils/schema-issues.ts`. No new export; `SchemaIssue` gains an optional `issues` field.
- **Who sees a change:** an agent whose tool input has a union, or whose output or tool input has a record with a key rule, gets the new text on a refusal. relay's screen builder (`apps/lab/relay/src/screen-builder/check.ts:301`, `tools.ts:82`) calls `flattenSchemaIssues` and gets the record change. Nothing outside cortex pins that text: Prism's test of `flattenSchemaIssues` (`packages/prism/test/errors.test.ts`) has no record key issue in it, since Prism now checks an object with an op key as that op.
- **Changeset:** `@niscorp/cortex` patch. **What to change:** nothing.
- **Speed:** only a refused output or call is formatted.

## What it does not do

- **It does not change how a branch is chosen.** Choosing the branch whose issues reach deepest into the value, as Prism's own formatter does, was tried and refused in review: on a plain tagged union whose branches share a field name (`kind: "chart"` and `kind: "table"`, both with a `config`), the wrong branch walks into the shared field and wins, and the model would be told `kind: expected "table"` and three issues about the wrong shape. Today's rule picks the right branch there. Prism's formatter can use depth because every Prism op has exactly one key of its own. The cost of keeping today's rule is one case found: nova's `push` without `action` is told `push: expected string, received object` (the `call` branch's complaint) where `push.action: … received undefined` would be right. A rule that gets both right was not found.
- **Not map or set issues.** zod 4.6.5 raises `invalid_key` and `invalid_element` for a `z.map` only when a key is an object, with the issue's path inside the key, and never for a `z.set`. A model's output is JSON, which has neither.
- **Not signal.** `packages/signal/src/run.ts:150` formats tool arguments the same way as the loop does today. It is signal's, and a change for a signal session.
- **Not Prism configs.** For a Prism config the fix is Prism's own (`packages/prism/docs/plans/error-messages.md`, step 8), released separately. With Prism of `main`, step 2 here would turn `$map: Invalid key in record` into `$map: An op name cannot be a plain object key`, the template branch's own reason, which is no better; Prism's release removes that choice.

## How it would be checked

- cortex's three `schema-issues` tests unchanged; a case for each row of the table above; one through the agent loop with a tool whose input is a union.
- `pnpm turbo run test --filter="...@niscorp/cortex"`.
