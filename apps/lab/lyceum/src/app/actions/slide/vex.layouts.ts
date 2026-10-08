import type { LayoutNode } from '@niscorp/nova';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';

// THE VEX TALK'S LAYOUTS — slides, read from a 16:9 screen: one claim across
// the top, one picture under it, in the READING GRAMMAR (ui/tokens.ts): the
// sheet at the page scale, a document only ever in an Exhibit, two side by
// side in a Pair. The screen holds about forty lines of the body size and
// nothing scrolls or clips, so a slide's budget is one exhibit of a dozen
// lines, or two of six, and a line or two of words beside them. What is
// argued is said: it is in the notes (db/vex.deck.ts). The way in, the
// register and the close reuse the nisc talk's layouts.

const sheet = (areas: string[], cols: number[], rows: (number | 'auto')[], children: LayoutNode[]): LayoutNode => ({
  component: 'Sheet',
  props: { size: 'fill', scale: 'page', areas, cols, rows },
  children,
});
const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});
const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });
const muted = (words: string): LayoutNode => ({ component: 'Text', props: { tone: 'muted' }, children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const exhibit = (caption: unknown, textAt: unknown, props: Record<string, unknown> = {}): LayoutNode => ({ component: 'Exhibit', props: { label: caption, text: textAt, ...props } });
const pair = (children: LayoutNode[], split?: 'wide-narrow'): LayoutNode => ({ component: 'Pair', ...(split === undefined ? {} : { props: { split } }), children });
// The kicker and the claim, together across the top of every slide.
const head = (): LayoutNode => cell('head', [label('{{$.kicker}}'), headline('display', '{{$.title}}')]);
// A slide shown in steps: the deck row's step (vex/deck.entries.ts) says how far.
const shown = (step: number): unknown => ({ $prism: { $gte: [{ $ref: '$.step.step' }, step] } });

// THE PROBLEM. The statement a model writes when asked for a query, and the
// two things that can happen to it — both need a person.
export const sqlLayout: LayoutNode = sheet(['head head', 'sql outcomes'], [1.3, 1], ['auto', 1], [
  head(),
  cell('sql', [exhibit('What a model writes when you ask it for a query', '$.sql', { lang: 'sql', tone: 'ink' })], { align: 'middle' }),
  cell(
    'outcomes',
    [
      {
        component: 'Sheet',
        props: { size: 'fill', areas: ['one', 'two', 'either'], rows: ['auto', 'auto', 1] },
        children: [
          {
            for: '$.outcomes',
            as: 'outcome',
            key: 'area',
            do: { component: 'Cell', props: { area: '$outcome.area', ink: '$outcome.ink' }, children: [label('{{$outcome.label}}'), text('{{$outcome.what}}')] },
          },
        ],
      },
    ],
    { pad: 'none' },
  ),
]);

// THE REQUEST, in steps: the intent; the shape, an example of the answer; and
// that this is all of it. Both halves as the JSON they are.
export const requestLayout: LayoutNode = sheet(['head head', 'intent shape', 'said said'], [1, 1], ['auto', 1, 'auto'], [
  head(),
  cell('intent', [exhibit('The request · what the caller wants to know', '$.intentJson', { lang: 'json' })], { align: 'middle' }),
  {
    if: shown(1),
    then: cell('shape', [exhibit('The request · an example of the answer', '$.shapeJson', { lang: 'json' })], { ink: 'highlight', align: 'middle' }),
    else: cell('shape', [], { mark: 'hatch' }),
  },
  { if: shown(2), then: cell('said', [headline('name', 'The whole request. No query written. No endpoint written.')], { ink: 'signal' }) },
]);

// WHAT THE MODEL WRITES: one of this app's own stored documents, as written,
// beside the statement the engine compiles for it now — the join it never
// wrote marked.
export const documentLayout: LayoutNode = sheet(['head head', 'doc statement'], [1.15, 1], ['auto', 1], [
  head(),
  cell('doc', [exhibit('$.file', '$.code', { lang: 'json', tone: 'ink' })], { align: 'middle' }),
  cell(
    'statement',
    [exhibit('The statement it compiles to · the join is the schema’s', '$.compiled.sql', { lang: 'sql', marked: '$.compiled.marked' })],
    { align: 'middle' },
  ),
]);

// WHAT THE MODEL IS SHOWN, in steps: the tables this caller may read, the
// grammar's fields, the caller's columns and the name their value goes by.
// Three documents of the same kind, so three panes of the same kind.
export const shownLayout: LayoutNode = sheet(['head head head', 'tables grammar caller'], [1, 1, 1], ['auto', 1], [
  head(),
  cell('tables', [exhibit('1 · Tables the caller may read', '$.tables')]),
  {
    if: shown(1),
    then: cell('grammar', [exhibit('2 · Grammar fields · {{$.grammar.rules}} rules', '$.grammar.text')]),
    else: cell('grammar', [], { mark: 'hatch' }),
  },
  {
    if: shown(2),
    then: cell('caller', [exhibit('3 · Caller’s columns · no value', '$.caller', { lang: 'json' })], { ink: 'highlight' }),
    else: cell('caller', [], { mark: 'hatch' }),
  },
]);

// SIX TOOLS, by name, as the agent is handed them — and the one thing true of all of them.
export const toolsLayout: LayoutNode = sheet(['head head', 'tools said'], [1, 1.2], ['auto', 1], [
  head(),
  cell('tools', [exhibit('The agent’s tools, as it is handed them', '$.tools', { tone: 'ink' })], { align: 'middle' }),
  cell('said', [headline('title', 'Every tool runs through the engine as the caller.'), text('There is no way to ask it to run something as nobody.')], { ink: 'signal', align: 'middle' }),
]);

// WATCH IT WRITE ONE. The speaker's question, as it is answered, as a picture
// (server/generation/trace.ts): the line every request walks — the request,
// Jev, the stored query, the engine, the answer — and under it the one detour,
// walked only when nothing stored matched and a query had to be written. What
// was walked is lit and what did not happen is not, so a replay and a new
// query are two different pictures. Under the picture, the one document there
// is to read — the draft the agent is testing, or the stored query a replay
// ran — and how it ended, with the models that ran.
export const writerLayout: LayoutNode = sheet(['head', 'picture', 'document', 'out'], [1], ['auto', 'auto', 1, 'auto'], [
  // The claim alone: the picture needs the room a kicker would take.
  cell('head', [headline('title', '{{$.title}}')]),
  cell('picture', [{ component: 'Pipeline', props: { steps: '$.trace.pipeline.steps', detour: '$.trace.pipeline.detour', legend: '$.trace.pipeline.legend' } }]),
  { if: '$.trace.document.text', then: cell('document', [exhibit('$.trace.document.caption', '$.trace.document.text', { lang: '$.trace.document.lang', flag: '$.trace.document.flag' })]), else: cell('document', [], { mark: 'hatch' }) },
  {
    if: { $eq: ['$.trace.outcome.kind', 'refused'] },
    then: cell('out', [headline('name', '{{$.trace.outcome.said}}')], { ink: 'alert' }),
    else: { if: '$.trace.outcome.fingerprint', then: cell('out', [headline('name', '{{$.trace.outcome.said}}')], { ink: 'signal' }), else: cell('out', [label('{{$.trace.outcome.said}}')]) },
  },
]);

// STORED UNDER A NAME. The speaker's query from the writer slide, replayed as
// the stage — its own rows — beside the claim about everybody's phone, and the
// room's tally underneath, live.
export const nameLayout: LayoutNode = sheet(['head head', 'stage phone', 'tally tally'], [1.1, 1], ['auto', 1, 'auto'], [
  head(),
  cell(
    'stage',
    [
      label('On the stage, replayed as the stage'),
      {
        if: '$.trace.outcome.fingerprint',
        then: {
          component: 'Stack',
          children: [
            exhibit('Sent', '$.trace.outcome.sent', { lang: 'json', tone: 'ink' }),
            // The stage's own policy decides what it gets back — refused, it says so.
            { if: '$.replayError', then: text('The stage may not read what this query reads: {{$.replayError.message}}'), else: { component: 'Stack', children: answerLayout({ kind: '$.trace.shapeKind', how: '$.how', rows: '$.replayed' }) } },
          ],
        },
        else: muted('Nothing stored yet: ask first, on the writer slide.'),
      },
    ],
    { ink: 'ink' },
  ),
  cell('phone', [label('On your phone: the same name'), headline('title', 'Same document. Your rows.'), text('Ask it in your own words. A question asked before replays, and no model runs.')], { ink: 'highlight' }),
  cell(
    'tally',
    [
      {
        component: 'Stats',
        props: {
          items: [
            { label: 'Asked before · replayed', value: '$.tally.replayed', ink: 'live' },
            { label: 'New · written and stored', value: '$.tally.generated', ink: 'signal' },
            { label: 'Not allowed · refused', value: '$.tally.refused' },
          ],
        },
      },
    ],
    { pad: 'none' },
  ),
]);

// A VALUE IN THE REQUEST. The speaker's search, mirrored from the controller:
// the request as sent, the statement with the value bound as $1, the rows —
// or, sent without the value, an empty answer and the key it missed.
export const valueLayout: LayoutNode = sheet(['head head', 'sent statement', 'rows rows'], [1, 1.2], ['auto', 'auto', 1], [
  head(),
  { if: '$.tool.searched.sent', then: cell('sent', [exhibit('Sent', '$.tool.searched.sent', { lang: 'json', tone: 'ink' })]), else: cell('sent', [muted('Searched from the controller: the request, the statement and the rows show here.')]) },
  { if: '$.tool.searched.sent', then: cell('statement', [exhibit('The statement — the value bound as $1, never in its text', '$.tool.searched.sql', { lang: 'sql' })]), else: cell('statement', [], { mark: 'hatch' }) },
  {
    if: '$.tool.searched.missing',
    then: cell('rows', [headline('name', 'Empty. Missing: {{$.tool.searched.missing}}'), exhibit('The contract the request missed', '$.tool.searched.contract', { lang: 'json' })], { ink: 'highlight' }),
    else: {
      if: '$.tool.searched.sent',
      then: cell('rows', [{ component: 'Rows', props: { rows: '$.tool.searched.rows', rowKey: 'name', empty: 'Nobody matches.', columns: [{ label: 'Name', key: 'name', w: 1 }] } }], { pad: 'none' }),
      else: cell('rows', [], { mark: 'hatch' }),
    },
  },
]);

// THIS APP: seeded, locked, nothing generated — the entry count, a request that
// asks the locked endpoint to generate and what it answers, and the write
// grammar's five operations.
export const lockedLayout: LayoutNode = sheet(['head head', 'counts counts', 'locked ops', 'answer ops'], [1.2, 1], ['auto', 'auto', 1, 'auto'], [
  head(),
  cell(
    'counts',
    [
      {
        component: 'Stats',
        props: {
          items: [
            { label: 'Stored entries, written by hand', value: '$.entries', ink: 'signal' },
            { label: 'Reads', value: '$.reads' },
            { label: 'Writes', value: '$.writes' },
          ],
        },
      },
    ],
    { pad: 'none' },
  ),
  cell('locked', [exhibit('POST /api/vex — a request with intent and shape', '$.request', { lang: 'json' })], { ink: 'ink', align: 'middle' }),
  // The endpoint's answer is a sentence, so it is set as one, in the refusal's ink.
  { if: '$.locked.message', then: cell('answer', [label('The answer'), text('{{$.locked.message}}')], { ink: 'alert' }), else: cell('answer', [label('Asking…')]) },
  cell('ops', [exhibit('Writes: five operations, never generated', '$.ops')], { ink: 'highlight', align: 'middle' }),
]);
