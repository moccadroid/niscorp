import type { Producer } from '@niscorp/cortex';
import { collectChannels } from '@niscorp/nova';
import type { AuditCatalogEntry } from '@niscorp/nova';
import { getConfigJsonSchema } from '@niscorp/prism';
import { todayStr } from '@relay/lib/date';
import { ACTIONS } from '@relay/app/action-catalog';
import { catalogEntries } from './catalog';

export const today = ((): string =>
  `Today's date is ${todayStr()}. The demo data is generated relative to this date — resolve date-relative requests ("overdue", "due this week") against it.`) satisfies Producer;

export const ambientContext = ((): string =>
  'Ambient request context: when an endpoint request is evaluated, $.userId (the signed-in user) and $.today (the current date) are folded into the source — request bindings may reference them directly (e.g. a date comparison binds { "$ref": "$.today" }).') satisfies Producer;

export const styleGuide = ((): string =>
  [
    'Relay house style — the screen must look native, plain and minimal:',
    '- Use every component in its DEFAULT styling. Never set backgrounds, borders or colors; never fake a container.',
    '- Do NOT render a heading that repeats the screen title — the chrome shows the title already. A small muted one-line summary (e.g. "{{$.rows.length}} found") is welcome.',
    '- A list of records is a Table. A single value (a KPI) is a Stack: a large Text for the number, a small muted Text label beneath.',
    '- Use the fewest components that convey the data.',
    '- Money, percentages and friendly dates come FORMATTED FROM THE QUERY: put display columns in your shape (e.g. value_display: "$1.2M", close_date_display: "Apr 6") instead of formatting in the layout. The layout renders values verbatim.',
  ].join('\n')) satisfies Producer;

export const knownChannels = (): string[] => {
  const channels = new Set<string>();
  for (const definition of Object.values(ACTIONS)) {
    const found = collectChannels(definition);
    for (const channel of [...found.emits, ...found.listens]) channels.add(channel);
  }
  return [...channels].sort();
};

// What a step may push: a screen the assistant may place is held to its input contract; every other action the app ships is known by id.
export const pushTargets = (): AuditCatalogEntry[] => {
  const placeable: AuditCatalogEntry[] = catalogEntries().map((entry) => ({ id: entry.id, input: entry.input }));
  const known = new Set(placeable.map((entry) => entry.id));
  return [...placeable, ...Object.keys(ACTIONS).filter((id) => !known.has(id)).map((id) => ({ id }))];
};

export const channels = ((): string =>
  `Message channels — kebab-case; a successful write announces itself on "<entity>s-changed" and every viewer of that entity listens and re-reads. Existing channels: ${knownChannels().join(', ')}.`) satisfies Producer;

export const transformDsl = ((): string =>
  'TRANSFORM DSL — endpoint `request`/`response` configs are transforms in this language, evaluated per call ' +
  '(request: over the action data; response: over the reply — for /vex endpoints the reply IS the bare query result, ' +
  'rows or record, no envelope). This language exists ONLY in endpoint request/response configs. It is NOT the layout ' +
  'binding grammar: layout props bind with string paths ("$.deals") or moustache ("{{$.deals.length}}"); a transform ' +
  'node like {"$ref": …} inside layout does not resolve and the component renders empty. Static JSON parts are literal; ' +
  `dynamic parts are ops. JSON Schema:\n${JSON.stringify(getConfigJsonSchema())}`) satisfies Producer;
