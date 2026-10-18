import { paletteFromRegistry } from '@niscorp/nova';
import type { CatalogEntry, Kit, ScreenSetup } from './types';

const REFERENCE = [
  'ACTION REFERENCE — a screen is one JSON object:',
  '{ "id": "a.dotted.id", "name": "Shown name", "description": "One line.",',
  '  "data": { every key the screen reads or writes, with its default },',
  '  "layout": <node>,',
  '  "endpoints": { "<name>": { "url": "…", "method": "POST", "request": <transform>, "target": "<data key>" } },',
  '  "triggers": [ { "event": "ui:click" | "ui:model", "ref": "<ref>", "do": [ <step>, … ] } ],',
  '  "lifecycle": { "mount": [ <step>, … ] } }',
  '',
  'LAYOUT',
  '- A node: { "component": "<from COMPONENTS>", "props": { … }, "children": <node | [nodes] | "text"> }.',
  '- "ref": "<name>" on a node sends its clicks to triggers with that ref. "model": "$.key" on an input or select writes what is typed or picked into data.key, then fires ui:model with the node\'s ref.',
  '- { "if": "$.key", "then": <node>, "else": <node> } shows one branch; { "for": "$.rows", "as": "row", "do": <node> } repeats one per row ("$row.field" inside).',
  '- Props and children bind data with "$.key" (the value itself) or text with "{{$.rows.length}} deals". Nothing else resolves in a layout.',
  '',
  'STEPS — each step is an object with one of these keys:',
  '- { "set": "key", "value": <literal or "@event.payload"> } writes data.key; "key" is a bare data key.',
  '- { "call": "<endpoint>", "onSuccess": [ … ], "onError": [ … ] } runs an endpoint; its reply lands in its target.',
  '- { "push": { "action": "<id from ACTIONS>", "input": { "id": "@event.payload" } } } opens another screen; "action" and "input" sit inside "push".',
  '- "@event.payload" is what the event carries: the row\'s key for a row click, the typed or picked value for ui:model.',
  '',
  'ENDPOINTS',
  '- "request" (and "response") are transforms, run on every call over the screen\'s data: literal JSON, with ops where a value varies.',
  '  { "$ref": "$.key" } reads data; { "$case": { "branches": [ { "when": { "$eq": [ { "$ref": "$.month" }, "June" ] }, "then": "2026-06-01" } ], "else": "2026-07-01" } } chooses;',
  '  { "$join": { "parts": [ "%", { "$ref": "$.q" }, "%" ], "sep": "" } } joins text;',
  '  { "$date": { "value": { "$dateAdd": { "date": { "$ref": "$.start" }, "amount": 7, "unit": "day" } }, "format": "YYYY-MM-DD" } } counts a date from another. These ops work only inside endpoints.',
  '- The reply is written to "target" as it comes.',
].join('\n');

const palette = (kit: Kit): string =>
  [
    'COMPONENTS — the only components a layout may use. A node is written { "component": …, "props": { … } }: every prop listed goes inside "props", never beside "component".',
    ...paletteFromRegistry(kit.registry, { include: [...kit.offer], omitProps: [...(kit.omitProps ?? [])] }).map(
      (entry) => `  ${entry.name} — ${entry.description}\n    { "component": "${entry.name}", "props": <${JSON.stringify(entry.propsSchema ?? {})}> }`,
    ),
  ].join('\n');

const catalog = (entries: readonly CatalogEntry[]): string =>
  [
    'ACTIONS — the screens a push may open, each with the input it takes:',
    ...entries.map((entry) => `  ${entry.id} — ${entry.description}\n    input: ${JSON.stringify(entry.input)}`),
  ].join('\n');

const examples = (kit: Kit): string =>
  kit.examples
    .map((example, at) =>
      [
        `EXAMPLE ${at + 1} — ${example.intent}`,
        ...example.prove.map((request) => `prove: ${JSON.stringify(request)}`),
        `action: ${JSON.stringify(example.action)}`,
        `probes: ${JSON.stringify(example.probes)}`,
      ].join('\n'),
    )
    .join('\n\n');

const ambient = (values: Readonly<Record<string, unknown>>): string =>
  `AMBIENT — every endpoint call carries these in its source, so a request may bind them: ${Object.entries(values)
    .map(([key, value]) => `{ "$ref": "$.${key}" } (now ${JSON.stringify(value)})`)
    .join(', ')}. Resolve a request relative to them ("my", "overdue") against these values.`;

export const EDITING = [
  'EDITING — the input carries the screen\'s current definition:',
  '- Change what the request asks for, nothing more.',
  '- Copy every part you have no reason to touch exactly as it is.',
  '- When the change needs a new query or a new section, make it rather than patching around it.',
  '- Check the whole definition, with probes, like a new screen.',
].join('\n');

export const contextOf = (setup: ScreenSetup): string[] => [
  REFERENCE,
  palette(setup.kit),
  ...(setup.kit.layoutRules === undefined ? [] : [setup.kit.layoutRules]),
  catalog(setup.catalog),
  examples(setup.kit),
  ambient(setup.ambient),
];
