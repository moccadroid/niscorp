# The screen harness: how hotfixed it is, and what a nisc harness looks like

2026-10-18, after the work recorded in [screen-builder.md](screen-builder.md). This is a review
and a proposal. Built the same evening inside relay, without the package changes: see "The module"
in [screen-builder.md](screen-builder.md).

## Short answers

**The reviewer: do we need it?** Not as it is. Run on qwen over two correct screens it answered a
clean `pass` both times — screens the harness's own check had already passed. On the one wrong
screen of the day (the live "filter deals by expiry date", whose dates never reach the query) its
verdict was refused twice and the screen shipped with "review unavailable". So today it adds two
agent runs and catches nothing measured. Its job is real — does the screen do what was asked — but
a model reading a JSON definition and judging it is the wrong tool for a model that does not reason
first. Proposed below: the agent states what the screen must do as probes, and the check runs them.

**Filter checks: an example problem?** Partly, yes. The builder has one worked example, a month
`Select` wired to a reload — and the month screens are the ones that came out right. There is no
example of a date range, a search box or an apply button wired to a query, and the live screen got
exactly that wrong. Examples are cheap and the models follow them. A check still has to catch what
an example does not teach; the choice probe covers selects only.

**How bad is the harness?** It works and it is measured, but it is an app harness compensating for
what the packages do not give it. Of its 31 mechanisms, 8 are copies of nova, vex and moss
knowledge, 11 are rescues and retries, and 12 are notes patched into tool results after a loop
was seen. Each fix was right; together they are a pile, and the next app starts from
nothing — lyceum already rebuilt its own query assistant.

## How hotfixed it is

The harness is `apps/lab/relay/src/server/functions/ray/architect/` (1,299 lines) plus
`seams.ts`, `writers.ts`, `knowledge.ts`, `catalog.ts` (124), a dev engine (138) and the suite (278).

**A. Package knowledge copied into relay (8)**
- `harness.ts:18` a copy of the live shell's endpoint transform (the ambient `userId` and `today`).
- `harness.ts:226` a hard-coded list of nova's layout binding directives, to spot prism in a layout.
- `harness.ts:250` the DOM's option-value rule (objects become `""`), checked by prop name.
- `harness.ts:191` vex's fingerprint format as a regex, to gate unproven fingerprints.
- `harness.ts:269` a regex that rewrites one of nova's audit messages; `:277` a second pass,
  `classifyAudit`, that sets audit findings aside by matching their text.
- `harness.ts:288` vex's `cache_miss` error recognised by substring, with advice appended.
- `tools.ts:89`, `:99` the app's vex route by URL and the shipped entries listed by hand —
  what moss already knows about the session's queries.
- The query guide (`tools.ts`, ~30 lines) restates vex's guide plus relay idioms (date ranges,
  search boxes, the endpoint recipe with `/api/vex`).

**B. Notes patched into results after a loop was seen (12)** — each correct, none designed:
five overlapping messages in the query tool's one `note` field (`tools.ts:235–260`: identical
query, already proved, shape not applied, not proven, one record), whose winner is decided by
spread order; the `ambient` note (`:246`); the literal-value refusal (`:193`); the replay's
context listing (`:67`); `run_action`'s `next` (`:296`); the transform's reshape hint; the
`cache_miss` advice; the empty-load diff.

**C. Retry and rescue layers (11)** — a build can end or restart in eleven ways:
`parseMaybeJson` (`tools.ts:186`), the re-sent-intent memo (`:64`), the ambient re-call (`:212`),
the extra call after a failed replay (`:67`), `outputRetries(5)`, `stepCount(20)`,
`duration('6m')`, `repeatedCalls(2)` (`architect.agent.ts:52`), the abort on a refused answer after
a pass (`run.ts:73`), the last-passing fallback (`run.ts:82`), and in the build tool up to three
builder runs and two reviews (`screens.ts:102–132`).

**D. Kit knowledge in a generic place**: the render check finds components named `Table`, the
choice probe controls that have `options`; the palette hides 25 relay components by name
(`producers.ts:6`).

**E. Context: 52k characters.** The raw ActionDefinition JSON Schema is 19.7k, the palette 12.5k,
the tool guides 5.9k. A model with no reasoning reads all of it every step.

**F. Two paths.** The dev scripts measure through their own engine, wire and a stand-in draft;
the product runs through the session. One silent bug (a new database per call) voided a day of
measurements before it was found.

**G. Each app again.** lyceum's assistant (423 lines) routes replay-or-generate and maps vex's
refusals itself; nova's `layoutAgent` exists and relay does not use it; prism's `mappingAgent` is
wrapped as a `map` tool and switched off as "a trap".

## The nisc harness: one position

**nova ships the screen builder, vex ships its data port, moss wires both to a session; the app
gives its kit, its catalog and its models.** Generating a screen from a sentence is what nisc is
for (an LLM writes nova actions); it should not be rebuilt per app.

| piece | package | what it is |
|---|---|---|
| `checkAction` | nova (`@niscorp/nova/agent`) | parse, audit, mount in a throwaway shell, load report, render and interaction probes; returns typed findings |
| component capabilities | nova (component `meta`) | which prop is a list binding, which prop holds choices and of what kind, which events a control emits — so no check names a component |
| `screenAgent` + run policy | nova (`@niscorp/nova/agent`) | the agent, its tools (`discover`, `prove`, `check`), its context, its stop and finish rules |
| `ScreenData` port | vex (`@niscorp/vex/agent`) | `discover()` and `prove(intent or replay)` answering a typed proof: rows sample, fingerprint, context contract with types, what is missing, warnings; fills ambient values, refuses binding syntax |
| session adapter | moss | `screenBuilder(session, { llm, kit })`: the data port from `session.answerIntent` and the vex route, the wire for mounting, the identity for ambient values, the draft for placing |
| the app | relay | which components to offer, the push catalog, the models, an optional house style producer — about fifty lines |

### Interfaces (sketch)

```ts
// nova
type ScreenKit = { registry: ComponentRegistry; offer?: readonly string[]; examples?: readonly ActionDefinition[] };
type ScreenData = {
  discover: () => Promise<{ entities: Entity[]; queries: { fingerprint: string; intent: string }[] }>;
  prove: (asked: { intent: string; shape: unknown; context?: Values } | { fingerprint: string; context?: Values }) => Promise<Proof>;
};
type Proof = { fingerprint?: string; rows: unknown[]; count: number; context: Record<string, { type: string; kind: string }>; missing: string[]; warnings: string[] };
type Finding = { code: 'schema' | 'audit' | 'load-empty' | 'unshown-rows' | 'choice-changes-nothing' | 'endpoint-failed' | 'transform-failed' | 'probe-failed'; at: string; message: string; fix?: string };
checkAction(definition, { kit, data, catalog, wire, ambient, proofs }): Promise<{ ok: boolean; findings: Finding[]; loaded: Record<string, string> }>;
buildScreen(intent, { kit, data, catalog, wire, ambient, llm, base?, signal? }): Promise<{ ok: true; action: ActionDefinition } | { ok: false; findings: Finding[] }>;
// moss
screenBuilder(session, { llm, kit, catalog? }): { build: (intent: string, options?: { edit?: string }) => Promise<BuildOutcome> };
```

### The run policy, designed once

- **A passing check is the result.** The agent never re-types the definition as its answer: when
  `check` passes, the run ends with that definition. Gone with it: refused final answers, split
  envelopes, the abort-after-pass and the last-passing fallback.
- **One stop rule**: steps, and identical calls answered alike.
- **Results rendered once** from typed fields: a proof or a finding becomes text in one place,
  so two notes can never hide each other.
- **At most one repair**, from the findings, and only when they name something to change.

### Semantic correctness: probes instead of a reviewer

The agent's final `check` call carries what the screen must do, in a small probe language:
"set `month` to `July`, expect `rows` to change", "click a row of `deals`, expect a push of
`crm.deal.view` with `id`". The check runs them in the throwaway shell. The model only writes what
to test; the harness decides pass or fail. That is measurable, catches today's live miss, and the
model writing it is the one that just read the intent.

### Context

- A compact authoring reference for ActionDefinition, written for a model (a few thousand
  characters), instead of the raw JSON Schema.
- The palette of the offered components only, with the props a model may set.
- Short examples per interaction pattern (a select filter, a search box, a date range, a row
  click) supplied by the kit, not one long example.

### The eval moves with it

The architect suite becomes the package's eval: intents, SQL oracles, a live check against the
same database, both reference models, one command. Every change to the harness is measured on it.

## Costs and order

1. `checkAction` and component capabilities in nova; relay calls it. The findings become typed.
   Measured on the suite: no regression.
2. The `ScreenData` port in vex and the session adapter in moss; relay's query tool and dev
   engine go.
3. `screenAgent` with the run policy in nova; relay keeps its configuration only.
4. Probes; the reviewer goes.
5. Examples per pattern and the compact reference; measure context size against the scores.

Each step is a package change (nova, vex, moss) under its own changeset, and each is measured on
both models before the next. The cost is real — three packages and their docs — but it is spent
once, instead of a harness per app. What it would not fix: what the models cannot do at all, and
the vex gaps found today (ordering by an aggregate; PGlite's string booleans).

## Open, for the owner

- The probe language: how small it can be and still say "this filter works".
- Whether the session adapter is a moss function or a moss feature with its own manifest entry.
- Whether nova's `layoutAgent` folds into the screen agent or stays for layout-only generation.
