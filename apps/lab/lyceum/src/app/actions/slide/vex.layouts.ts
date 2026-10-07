import type { LayoutNode } from '@niscorp/nova';
import { answerLayout } from '@lyceum/app/actions/shared/answer.layouts';

// THE VEX TALK'S LAYOUTS — each designed for its one claim and its one picture.
// The way in, the register and the close reuse the nisc talk's layouts.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});
const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });
const muted = (words: string): LayoutNode => ({ component: 'Text', props: { tone: 'muted' }, children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const code = (textAt: string, markedAt?: string): LayoutNode => ({ component: 'Code', props: { text: textAt, ...(markedAt !== undefined ? { marked: markedAt } : {}) } });
const figure = (words: string, valueAt: string): LayoutNode => ({ component: 'Figure', props: { label: words, value: valueAt } });
// A slide shown in steps: the deck row's step (vex/deck.entries.ts) says how far.
const shown = (step: number): unknown => ({ $prism: { $gte: [{ $ref: '$.step.step' }, step] } });

// THE PROBLEM. The statement a model writes when asked for a query, and the
// two things that can happen to it — both need a person.
export const sqlLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'sql outcomes'], cols: [1.4, 1], rows: ['auto', 'auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell('sql', [label('What a model writes when you ask it for a query'), code('$.sql')], { ink: 'ink', align: 'middle' }),
    cell('outcomes', [{ for: '$.outcomes', as: 'outcome', key: 'n', do: { component: 'Text', children: '{{$outcome.n}}  {{$outcome.what}}' } }], { align: 'middle' }),
  ],
};

// THE REQUEST, in steps: the intent; the shape, an example of the answer; and
// that this is all of it.
export const requestLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'intent shape', 'said said'], cols: [1, 1], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell('intent', [label('Intent, in words'), code('$.intent')], { align: 'middle' }),
    {
      if: shown(1),
      then: cell('shape', [label('Shape: an example of the answer'), code('$.shape'), text('"" means a string, 0 a number. A list of one means a list.')], { ink: 'highlight', align: 'middle' }),
      else: cell('shape', [], { mark: 'hatch' }),
    },
    { if: shown(2), then: cell('said', [headline('name', 'That is the whole request. Nobody wrote a query. Nobody wrote an endpoint.')], { ink: 'signal' }) },
  ],
};

// WHAT THE MODEL WRITES: one of this app's own stored documents, as written,
// beside the statement the engine compiles for it now — the join it never
// wrote marked.
export const documentLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'doc sql'], cols: [1, 1.25], rows: ['auto', 'auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell('doc', [label('{{$.file}}'), code('$.code')], { ink: 'ink', align: 'middle' }),
    cell(
      'sql',
      [
        label('The statement the engine compiles for it, now'),
        code('$.compiled.sql', '$.compiled.marked'),
        text('The join came from the schema: the engine read the foreign key when it started. Nobody wrote it.'),
        text('A rule in the charter adds the caller’s own rows on every run. You will see it in the statement a test compiles, two slides on.'),
      ],
      { align: 'middle' },
    ),
  ],
};

// WHAT THE MODEL IS SHOWN, in steps: the tables this caller may read, the
// grammar with its own instructions, one line about the caller.
export const shownLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'schema grammar caller'], cols: [1, 1.4, 1], rows: ['auto', 'auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell('schema', [label('1 · The tables this caller may read'), code('$.tables'), text('A table they may not read is not in the schema. Asking about it gets "not found", the same answer a misspelled table gets.')]),
    {
      if: shown(1),
      then: cell('grammar', [label('2 · The grammar, with its own instructions'), code('$.grammar.text'), text('The field descriptions are the rules. There is no separate text that explains the grammar to the model.')], { ink: 'ink' }),
      else: cell('grammar', [], { mark: 'hatch' }),
    },
    {
      if: shown(2),
      then: cell('caller', [label('3 · One line about the caller'), code('$.caller'), text('Which column identifies the caller, and the name the value goes by. Never the value itself.')], { ink: 'highlight' }),
      else: cell('caller', [], { mark: 'hatch' }),
    },
  ],
};

// SIX TOOLS, as the agent is handed them: their names and what each says it does.
export const toolsLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'tools', 'said'], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
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
  ],
};

// WATCH IT WRITE ONE. The speaker's question as the engine saw it: what the
// model was shown, each thing it did — a look at the data on paper, a test
// that failed in orange, one that ran in green, each with the engine's own
// words — and how it ended: the document, the statement it compiled under the
// caller's policy, and the name it is stored under. Live: the trace changes
// under the slide as the writer works.
const step: LayoutNode = {
  component: 'Sheet',
  props: { areas: ['what text ms'], cols: [1, 5, 0.7] },
  children: [
    { component: 'Cell', props: { area: 'what', ink: '$step.ink' }, children: [label('{{$step.n}} · {{$step.what}}')] },
    { component: 'Cell', props: { area: 'text' }, children: [code('$step.text')] },
    { component: 'Cell', props: { area: 'ms', align: 'end' }, children: [text('{{$step.ms}} ms')] },
  ],
};

export const writerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head shown', 'steps steps', 'out out'], cols: [1.3, 1], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}'), label('Intent'), text('{{$.trace.intent}}'), label('Shape'), code('$.trace.shape')]),
    cell('shown', [label('What the model was shown'), text('The tables this caller may read: {{$.trace.shown.tables}}'), code('$.trace.shown.caller')], { ink: 'highlight' }),
    cell('steps', [{ for: '$.trace.steps', as: 'step', key: 'n', do: step }], { scroll: 'y', pad: 'none' }),
    cell(
      'out',
      [
        label('{{$.trace.outcome.kind}} · {{$.trace.ms}} ms'),
        code('$.trace.outcome.text'),
        { if: '$.trace.outcome.sql', then: code('$.trace.outcome.sql') },
        { if: '$.trace.outcome.fingerprint', then: headline('name', 'Stored under {{$.trace.outcome.fingerprint}} — replayed from now on, with no model.') },
      ],
      { ink: 'signal' },
    ),
  ],
};

// STORED UNDER A NAME. The speaker's query from the writer slide, replayed as
// the stage — the stage's rows — beside the claim about everybody's phone, and
// the room's tally underneath, live.
export const nameLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'stage phone', 'tally tally'], cols: [1, 1], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell(
      'stage',
      [
        label('On the stage, replayed as the stage'),
        {
          if: '$.trace.outcome.fingerprint',
          then: { component: 'Cell', props: {}, children: [headline('name', '{{$.trace.outcome.fingerprint}}'), ...answerLayout({ kind: '$.trace.shapeKind', how: '$.how', rows: '$.replayed' })] },
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
          component: 'Sheet',
          props: { areas: ['again new cannot'], cols: [1, 1, 1] },
          children: [
            cell('again', [figure('Asked before · replayed', '$.tally.replayed')], { ink: 'live' }),
            cell('new', [figure('New · written and stored', '$.tally.generated')], { ink: 'signal' }),
            cell('cannot', [figure('Not allowed · refused', '$.tally.refused')]),
          ],
        },
      ],
      { pad: 'none' },
    ),
  ],
};

// A VALUE IN THE REQUEST. The speaker's search, mirrored from the controller:
// the request as sent, the statement with the value bound as $1, the rows —
// or, sent without the value, an empty answer and the key it missed.
export const valueLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'sent statement', 'rows rows'], cols: [1, 1.2], rows: ['auto', 'auto', 'auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell('sent', [label('Sent'), code('$.tool.searched.sent')], { ink: 'ink' }),
    cell('statement', [label('The statement — the value bound as $1, never in its text'), code('$.tool.searched.sql')]),
    {
      if: '$.tool.searched.missing',
      then: cell('rows', [headline('name', 'Empty. Missing: {{$.tool.searched.missing}}'), code('$.tool.searched.contract'), text('An empty list and a note naming the key. A caller learns the contract from the first attempt.')], { ink: 'highlight' }),
      else: {
        if: '$.tool.searched.sent',
        then: cell('rows', [{ component: 'Rows', props: { rows: '$.tool.searched.rows', rowKey: 'name', empty: 'Nobody matches.', columns: [{ label: 'Name', key: 'name', w: 1 }] } }], { pad: 'none' }),
        else: cell('rows', [muted('Searched from the controller: the request, the statement and the rows show here.')], { mark: 'hatch' }),
      },
    },
  ],
};

// THIS APP: seeded, locked, nothing generated — the entry count, a request that
// asks the locked endpoint to generate and what it answers, and the write
// grammar's five operations.
export const lockedLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'n reads writes', 'locked locked ops'], cols: [1, 1, 1], rows: ['auto', 'auto', 'auto', 1] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')]),
    cell('n', [figure('Stored entries, written by hand', '$.entries')], { ink: 'signal' }),
    cell('reads', [figure('Reads', '$.reads')]),
    cell('writes', [figure('Writes', '$.writes')]),
    cell(
      'locked',
      [label('A request with intent and shape, to this app’s endpoint'), code('$.request'), label('The answer'), { if: '$.locked.message', then: code('$.locked.message'), else: text('Asking…') }],
      { ink: 'ink' },
    ),
    cell('ops', [label('Writes: five operations, never generated'), code('$.ops'), text('A model may fill one in and hand it to a person as a form. The person presses the button.')], { ink: 'highlight' }),
  ],
};
