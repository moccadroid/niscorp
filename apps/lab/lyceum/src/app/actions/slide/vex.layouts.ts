import type { LayoutNode } from '@niscorp/nova';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';

// THE VEX TALK'S LAYOUTS — each designed for its one claim and its one picture,
// in the READING GRAMMAR (ui/tokens.ts, "the reading grammar"): every sheet at
// the page scale, so sizes are fixed and nothing grows with its neighbour; a
// document only ever in an Exhibit, captioned and set in colour, never in a
// cell beside prose; two documents side by side in a Pair; a row of figures in
// Stats. The way in, the register and the close reuse the nisc talk's layouts.

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
const text = (words: string, size?: 'lede' | 'small' | 'fine'): LayoutNode => ({ component: 'Text', ...(size === undefined ? {} : { props: { size } }), children: words });
const muted = (words: string): LayoutNode => ({ component: 'Text', props: { tone: 'muted' }, children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const exhibit = (caption: string, textAt: string, props: Record<string, unknown> = {}): LayoutNode => ({ component: 'Exhibit', props: { label: caption, text: textAt, ...props } });
const pair = (children: LayoutNode[], split?: 'narrow-wide' | 'wide-narrow'): LayoutNode => ({ component: 'Pair', ...(split === undefined ? {} : { props: { split } }), children });
// The kicker and the claim, across the top of every slide.
const head = (): LayoutNode[] => [cell('kick', [label('{{$.kicker}}')]), cell('head', [headline('display', '{{$.title}}')])];
// A slide shown in steps: the deck row's step (vex/deck.entries.ts) says how far.
const shown = (step: number): unknown => ({ $prism: { $gte: [{ $ref: '$.step.step' }, step] } });

// THE PROBLEM. The statement a model writes when asked for a query, and the
// two things that can happen to it — both need a person.
export const sqlLayout: LayoutNode = sheet(['kick kick', 'head head', 'sql outcomes'], [1.3, 1], ['auto', 'auto', 1], [
  ...head(),
  cell('sql', [exhibit('What a model writes when you ask it for a query', '$.sql', { lang: 'sql', tone: 'ink' })], { align: 'middle' }),
  cell('outcomes', [{ component: 'Stack', props: { gap: 'tight' }, children: [{ for: '$.outcomes', as: 'outcome', key: 'n', do: text('{{$outcome.n}}  {{$outcome.what}}') }] }], { align: 'middle' }),
]);

// THE REQUEST, in steps: the intent; the shape, an example of the answer; and
// that this is all of it. Both halves of the request as the JSON they are.
export const requestLayout: LayoutNode = sheet(['kick kick', 'head head', 'intent shape', 'said said'], [1, 1], ['auto', 'auto', 1, 'auto'], [
  ...head(),
  cell('intent', [exhibit('The request · what the caller wants to know', '$.intentJson', { lang: 'json' }), text('In words. Only the one who writes the query reads it.')], { align: 'middle' }),
  {
    if: shown(1),
    then: cell('shape', [exhibit('The request · an example of the answer', '$.shapeJson', { lang: 'json' }), text('"" means a string, 0 a number. A list of one means a list.')], { ink: 'highlight', align: 'middle' }),
    else: cell('shape', [], { mark: 'hatch' }),
  },
  { if: shown(2), then: cell('said', [headline('name', 'That is the whole request. Nobody wrote a query. Nobody wrote an endpoint.')], { ink: 'signal' }) },
]);

// WHAT THE MODEL WRITES: one of this app's own stored documents, as written,
// beside the statement the engine compiles for it now — the join it never
// wrote marked.
export const documentLayout: LayoutNode = sheet(['kick kick', 'head head', 'docs docs'], [1, 1], ['auto', 'auto', 1], [
  ...head(),
  cell(
    'docs',
    [
      pair([
        exhibit('$.file', '$.code', { lang: 'json', tone: 'ink' }),
        { component: 'Stack', children: [exhibit('The statement the engine compiles for it, now', '$.compiled.sql', { lang: 'sql', marked: '$.compiled.marked' }), text('The join came from the schema: the engine read the foreign key when it started. Nobody wrote it.'), text('A rule in the charter adds the caller’s own rows on every run. You will see it in the statement a test compiles, two slides on.')] },
      ]),
    ],
    { align: 'middle' },
  ),
]);

// WHAT THE MODEL IS SHOWN, in steps: the tables this caller may read, the
// grammar with its own instructions, one line about the caller.
export const shownLayout: LayoutNode = sheet(['kick kick kick', 'head head head', 'schema grammar caller'], [1, 1.4, 1], ['auto', 'auto', 1], [
  ...head(),
  cell('schema', [exhibit('1 · The tables this caller may read', '$.tables'), text('A table they may not read is not in the schema. Asking about it gets "not found", the same answer a misspelled table gets.')]),
  {
    if: shown(1),
    then: cell('grammar', [exhibit('2 · The grammar, with its own instructions', '$.grammar.text', { tone: 'ink' }), text('The field descriptions are the rules. There is no separate text that explains the grammar to the model.')]),
    else: cell('grammar', [], { mark: 'hatch' }),
  },
  {
    if: shown(2),
    then: cell('caller', [exhibit('3 · One line about the caller', '$.caller'), text('Which column identifies the caller, and the name the value goes by. Never the value itself.')], { ink: 'highlight' }),
    else: cell('caller', [], { mark: 'hatch' }),
  },
]);

// SIX TOOLS, as the agent is handed them: their names and what each says it does.
export const toolsLayout: LayoutNode = sheet(['kick', 'head', 'tools', 'said'], [1], ['auto', 'auto', 1, 'auto'], [
  ...head(),
  cell(
    'tools',
    [
      {
        component: 'Rows',
        props: {
          rows: '$.tools',
          rowKey: 'name',
          columns: [
            { label: 'Tool', key: 'name', kind: 'mono', w: 1 },
            { label: 'What it says it does', key: 'description', w: 3 },
          ],
        },
      },
    ],
    { pad: 'none' },
  ),
  cell('said', [headline('name', 'Every tool that touches data runs through the engine as the caller. There is no way to ask it to run something as nobody.')], { ink: 'signal' }),
]);

// WATCH IT WRITE ONE. The speaker's question as the engine saw it: the
// request; what the model was shown; each thing it did, as a pair of exhibits
// — what it sent, and what came back, the answer flagged orange when a draft
// failed and green when it ran, in the engine's own words; and how it ended:
// the document that passed beside the statement it compiled under the
// caller's policy, and the name it is stored under. Live: the trace changes
// under the slide as the writer works.
const step: LayoutNode = pair([
  exhibit('$step.label', '$step.draft', { lang: 'json' }),
  exhibit('$step.said', '$step.answer', { lang: '$step.lang', flag: '$step.ink' }),
]);

export const writerLayout: LayoutNode = sheet(['kick kick', 'head shown', 'steps steps', 'out out'], [1, 1], ['auto', 'auto', 1, 'auto'], [
  cell('kick', [label('{{$.kicker}}')]),
  cell('head', [headline('title', '{{$.title}}'), exhibit('The request', '$.trace.request', { lang: 'json' })]),
  // What the model was shown has its own slide; here, the one thing that is
  // this caller's: the tables they may read.
  cell(
    'shown',
    [
      label('What the model was shown'),
      // A replay shows the model nothing: there is no line to fill in.
      { if: '$.trace.shown.tables', then: text('The tables this caller may read: {{$.trace.shown.tables}}.', 'small'), else: text('Nothing: a question asked before replays its stored query, and no model runs.', 'small') },
      text('The grammar, with its own instructions, and one line about the caller — the slide before this one.', 'small'),
    ],
    { ink: 'highlight' },
  ),
  cell('steps', [{ component: 'Stack', props: { scroll: 'y' }, children: [{ for: '$.trace.steps', as: 'step', key: 'n', do: step }] }], { pad: 'none' }),
  // How it ended. The document that passed is the last green draft above; what
  // is new here is the statement it compiled, or the reason it was refused.
  cell(
    'out',
    [
      pair([
        { component: 'Stack', props: { gap: 'tight' }, children: [label('{{$.trace.outcome.kind}} · {{$.trace.ms}} ms'), text('{{$.trace.outcome.label}}'), { if: '$.trace.outcome.fingerprint', then: headline('name', 'Stored under {{$.trace.outcome.fingerprint}} — replayed from now on, with no model.') }] },
        {
          if: '$.trace.outcome.sql',
          then: exhibit('The statement it compiled, under this caller’s policy', '$.trace.outcome.sql', { lang: 'sql', tone: 'ink' }),
          else: { if: '$.trace.outcome.text', then: exhibit('Why', '$.trace.outcome.text', { tone: 'ink', flag: 'alert' }) },
        },
      ]),
    ],
    { ink: 'signal' },
  ),
]);

// STORED UNDER A NAME. The speaker's query from the writer slide, replayed as
// the stage — its own rows — beside the claim about everybody's phone, and
// the room's tally underneath, live.
export const nameLayout: LayoutNode = sheet(['kick kick', 'head head', 'stage phone', 'tally tally'], [1, 1], ['auto', 'auto', 1, 'auto'], [
  ...head(),
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
  cell(
    'phone',
    [
      label('On your phone: the same name'),
      headline('name', 'Same document. Your rows.'),
      text('The rule is applied on every run, after the document is read and before the statement is built.'),
      text('Ask the same in your own words: no model runs for a question asked before.'),
    ],
    { ink: 'highlight' },
  ),
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
export const valueLayout: LayoutNode = sheet(['kick kick', 'head head', 'sent statement', 'rows rows'], [1, 1.2], ['auto', 'auto', 'auto', 1], [
  ...head(),
  cell('sent', [exhibit('Sent', '$.tool.searched.sent', { lang: 'json', tone: 'ink' })]),
  cell('statement', [exhibit('The statement — the value bound as $1, never in its text', '$.tool.searched.sql', { lang: 'sql' })]),
  {
    if: '$.tool.searched.missing',
    then: cell('rows', [headline('name', 'Empty. Missing: {{$.tool.searched.missing}}'), exhibit('The contract the request missed', '$.tool.searched.contract', { lang: 'json' }), text('An empty list and a note naming the key. A caller learns the contract from the first attempt.')], { ink: 'highlight' }),
    else: {
      if: '$.tool.searched.sent',
      then: cell('rows', [{ component: 'Rows', props: { rows: '$.tool.searched.rows', rowKey: 'name', empty: 'Nobody matches.', columns: [{ label: 'Name', key: 'name', w: 1 }] } }], { pad: 'none' }),
      else: cell('rows', [muted('Searched from the controller: the request, the statement and the rows show here.')], { mark: 'hatch' }),
    },
  },
]);

// THIS APP: seeded, locked, nothing generated — the entry count, a request that
// asks the locked endpoint to generate and what it answers, and the write
// grammar's five operations.
export const lockedLayout: LayoutNode = sheet(['kick kick', 'head head', 'counts counts', 'locked ops'], [1.2, 1], ['auto', 'auto', 'auto', 1], [
  ...head(),
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
  cell(
    'locked',
    [
      exhibit('POST /api/vex — a request with intent and shape', '$.request', { lang: 'json' }),
      { if: '$.locked.message', then: exhibit('The answer', '$.locked.message', { flag: 'alert' }), else: text('Asking…') },
    ],
    { ink: 'ink' },
  ),
  cell('ops', [exhibit('Writes: five operations, never generated', '$.ops'), text('A model may fill one in and hand it to a person as a form. The person presses the button.')], { ink: 'highlight' }),
]);
