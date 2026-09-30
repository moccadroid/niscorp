import type { LayoutNode } from '@niscorp/nova';

// The slides' layouts: the one grammar at two registers — one loud thing per
// slide (a display headline or a figure), everything else at reading size.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });

// The app's own size, counted from its source by the server — so it cannot go
// stale (server/census.ts).
export const censusLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick chart', 'head chart', 'share chart'], cols: [1.1, 1.5], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [{ component: 'Headline', props: { level: 'display' }, children: '{{$.title}}' }], { align: 'end' }),
    cell(
      'chart',
      [
        label('Lines of code'),
        {
          component: 'Columns',
          props: {
            bars: [
              { label: 'Data', value: '$.census.data', ink: 'live' },
              { label: 'Renderers', value: '$.census.renderers', ink: 'signal' },
              { label: 'Endpoints', value: '$.census.endpoints', ink: 'signal' },
              { label: 'Setup', value: '$.census.setup', ink: 'signal' },
              { label: 'Tests', value: '$.census.checkLines', ink: 'ink' },
            ],
          },
        },
      ],
    ),
    cell('share', [{ component: 'Figure', props: { label: '% data (tests aside)', value: '$.census.share' } }], { ink: 'live' }),
  ],
};
