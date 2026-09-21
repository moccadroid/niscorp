import type { LayoutNode } from '@niscorp/nova';

// Four lines, one shape: the verdict as a badge in the tone the read gave it,
// what the line is about, and the sentence the read wrote. The layout binds
// three keys per line and knows nothing about stages.
const line = (label: string | { bind: string }, scope: string): LayoutNode => ({
  component: 'Row',
  props: { gap: 10, align: 'baseline', wrap: true },
  children: [
    { component: 'Badge', props: { label: `$.${scope}.verdict`, tone: `$.${scope}.tone` } },
    { component: 'Text', props: { value: typeof label === 'string' ? label : label.bind, variant: 'tag', tone: 'mute' } },
    { component: 'Text', props: { value: `$.${scope}.line` } },
  ],
});

// THE CARD'S OWN TONE IS THE WORST OF ITS LINES — "the impact card goes red".
// Three reads land in three places, so this is the one thing computed here
// rather than in a read; it is a fold over verdicts the reads already gave.
const verdicts = { $flatten: [[{ $ref: '$.fit.verdict' }, { $ref: '$.cover.verdict' }], { $map: { over: { $ref: '$.stage' }, as: 'row', body: { $get: { from: { $var: 'row' }, path: ['verdict'] } } } }] };
const has = (verdict: string): Record<string, unknown> => ({ $gt: [{ $count: { over: { $filter: { over: verdicts, as: 'verdict', when: { $eq: [{ $var: 'verdict' }, verdict] } } } } }, 0] });
const worst = { $prism: { $case: { branches: [{ when: has('does not fit'), then: 'alert' }, { when: has('tight'), then: 'warn' }], else: 'good' } } };

export const moveImpactLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Impact of the move', subtitle: '{{$.act.name}} → {{$.fit.name}}', tone: worst },
  children: [
    {
      if: '$.fit.verdict',
      then: {
        component: 'Stack',
        props: { gap: 8 },
        children: [
          line('capacity', 'fit'),
          { for: '$.stage', as: 'row', key: 'key', do: line({ bind: '$.row.label' }, 'row') },
          { if: '$.cover.verdict', then: line('weather', 'cover'), else: '' },
        ],
      },
      else: { component: 'Text', props: { value: 'Pick an act and a stage to see what the move would do.', tone: 'mute' } },
    },
  ],
};
