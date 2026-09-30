import type { LayoutNode } from '@niscorp/nova';

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({ component: 'Cell', props: { area, ...props }, children });
const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string): LayoutNode => ({ component: 'Text', children: words });

export const sinkLayout: LayoutNode = {
  component: 'Sheet',
  props: {
    size: 'fill',
    areas: [
      'kick kick kick kick',
      'display display display figure',
      'paper ink signal alert',
      'highlight highlight live live',
      'stripes dots bars checks',
      'hatch title name code',
      'rows rows rows code',
      'bar bar bar bar',
      'act1 act2 act3 act4',
    ],
    rows: ['auto', 1, 'auto', 'auto', 'auto', 'auto', 'auto', 'auto', 'auto'],
  },
  children: [
    cell('kick', [label('Kitchen sink — every piece of the look')]),
    cell('display', [{ component: 'Headline', props: { level: 'display' }, children: 'Display headline' }], { align: 'end' }),
    cell('figure', [{ component: 'Figure', props: { label: 'Figure', value: 47 } }], { ink: 'signal', align: 'end' }),
    cell('paper', [label('Paper'), text('The default ink.')]),
    cell('ink', [label('Ink'), text('Black blocks.')], { ink: 'ink' }),
    cell('signal', [label('Signal'), text('The one fact that matters.')], { ink: 'signal' }),
    cell('alert', [label('Alert'), text('Act on this.')], { ink: 'alert' }),
    cell('highlight', [label('Highlight'), text('What the pointer is on; what the eye should find.')], { ink: 'highlight' }),
    cell('live', [label('Live'), text('A number that changes on its own.')], { ink: 'live' }),
    cell('stripes', [{ component: 'Sigil', props: { shape: 'triangle', size: 'large' } }, label('Stripes · triangle')], { mark: 'stripes' }),
    cell('dots', [{ component: 'Sigil', props: { shape: 'circle', size: 'large' } }, label('Dots · circle')], { mark: 'dots' }),
    cell('bars', [{ component: 'Sigil', props: { shape: 'cross', size: 'large' } }, label('Bars · cross')], { mark: 'bars' }),
    cell('checks', [{ component: 'Sigil', props: { shape: 'square', size: 'large' } }, label('Checks · square')], { mark: 'checks' }),
    cell('hatch', [text('Not yet — the hatch.')], { mark: 'hatch' }),
    cell('title', [label('Title'), { component: 'Headline', props: { level: 'title' }, children: 'A title' }]),
    cell('name', [label('Name'), { component: 'Headline', props: { level: 'name' }, children: 'Quiet Otter' }, { component: 'Text', props: { tone: 'muted' }, children: 'Muted text.' }]),
    cell('code', [label('sink.layout.ts'), { component: 'Code', props: { text: '$.code', marked: [3] } }], { ink: 'ink' }),
    cell(
      'rows',
      [
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'id',
            columns: [
              { label: '', key: 'sigil', kind: 'sigil', w: 0.35 },
              { label: 'Name', key: 'name', w: 2 },
              { label: 'Last query', key: 'how', w: 1.5, missing: 'none yet' },
              { label: 'Fingerprint', key: 'fp', kind: 'mono', w: 2 },
            ],
          },
        },
      ],
      { pad: 'none' },
    ),
    cell('bar', [{ component: 'Bar', props: { segments: [{ value: 3, ink: 'signal' }, { value: 2, ink: 'live' }, { value: 2, mark: 'dots' }, { value: 1, ink: 'highlight' }, { value: 1, ink: 'alert' }, { value: 2, mark: 'hatch' }] } }], { pad: 'none' }),
    { component: 'Action', ref: 'a', props: { area: 'act1', label: 'Paper action' } },
    { component: 'Action', ref: 'b', props: { area: 'act2', ink: 'ink', label: 'Ink action' } },
    { component: 'Action', ref: 'c', props: { area: 'act3', ink: 'signal', label: 'Signal action' } },
    { component: 'Action', ref: 'd', props: { area: 'act4', ink: 'alert', label: 'Next →' } },
  ],
};
