import type { LayoutNode } from '@niscorp/nova';

// THE VEX TALK'S LAYOUTS — each designed for its one claim and its one picture.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});
const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const code = (textAt: string): LayoutNode => ({ component: 'Code', props: { text: textAt } });

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
    {
      if: { $eq: ['$step.ink', 'alert'] },
      then: { component: 'Cell', props: { area: 'what', ink: 'alert' }, children: [label('{{$step.n}} · {{$step.what}}')] },
      else: {
        if: { $eq: ['$step.ink', 'live'] },
        then: { component: 'Cell', props: { area: 'what', ink: 'live' }, children: [label('{{$step.n}} · {{$step.what}}')] },
        else: { component: 'Cell', props: { area: 'what' }, children: [label('{{$step.n}} · {{$step.what}}')] },
      },
    },
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
        { if: '$.trace.outcome.fingerprint', then: { component: 'Headline', props: { level: 'name' }, children: 'Stored under {{$.trace.outcome.fingerprint}} — replayed from now on, with no model.' } },
      ],
      { ink: 'signal' },
    ),
  ],
};
