import type { LayoutNode } from '@niscorp/nova';

const group = (label: string, tiles: LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 6 },
  children: [{ component: 'Text', props: { size: 'xs', color: 'faint', caps: true }, children: label }, ...tiles],
});

export const dockLayout: LayoutNode = {
  component: 'Dock',
  props: { open: '$.open', side: 'left', wide: false },
  children: {
    if: '$.open',
    then: {
      // `shrink` lets the list below scroll: the panel caps its own height, so
      // this must be allowed shorter than its content.
      component: 'Stack',
      props: { gap: 0, shrink: true },
      children: [
        {
          component: 'Box',
          props: { px: 14, py: 11, border: 'bottom' },
          children: {
            component: 'Row',
            props: { justify: 'between', align: 'center', gap: 10 },
            children: [
              {
                component: 'Stack',
                props: { gap: 0 },
                children: [
                  { component: 'Text', props: { serif: true, size: 'lg' }, children: 'Atrium — behind the scenes' },
                  { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Our tool. Not part of the application underneath.' },
                ],
              },
              { component: 'Button', ref: 'shut', props: { variant: 'plain', icon: 'close', label: 'Collapse the admin dock' }, children: '' },
            ],
          },
        },
        {
          component: 'Box',
          props: { px: 14, py: 14, grow: true, scroll: true, shrink: true },
          children: {
            component: 'Stack',
            props: { gap: 16 },
            children: [
              { component: 'Tile', ref: 'explain', props: { title: 'Explain', icon: 'search', blurb: 'Why can this principal not see that? The whole chain, and which link broke.' } },

              group('What exists', [
                { component: 'Tile', ref: 'charter', props: { title: 'Charter', icon: 'flag', blurb: 'Roles as compiled, principals as resolved. Ring 1, and who may hold what.' } },
                { component: 'Tile', ref: 'catalog', props: { title: 'Catalog', icon: 'receipt', blurb: 'Every action definition — contract, wiring, and a live preview of its layout.' } },
                { component: 'Tile', ref: 'entries', props: { title: 'Entries', icon: 'door', blurb: 'Every read and write the app can make. Warm-only, so this list is the API.' } },
              ]),

              group('Where it lands', [
                { component: 'Tile', ref: 'surface', props: { title: 'Surface', icon: 'bed', blurb: 'Every slot × every property, live or dark, and the reason the resolver gave.' } },
                { component: 'Tile', ref: 'capabilities', props: { title: 'Capabilities', icon: 'plug', blurb: 'Connector offers, property enablement, and the discovery pull.' } },
              ]),

              group('What is happening', [
                { component: 'Tile', ref: 'shells', props: { title: 'Shells', icon: 'chart', blurb: 'Living server shells, what is mounted on each, and the process behind them.' } },
                { component: 'Tile', ref: 'timeline', props: { title: 'Timeline', icon: 'clock', blurb: 'Every endpoint the shells called — names and timings, never payloads.' } },
                { component: 'Tile', ref: 'runs', props: { title: 'Agent runs', icon: 'sparkle', blurb: 'Every model run: the whole exchange, the tools it called, what it cost.' } },
              ]),
            ],
          },
        },
      ],
    },
    else: { component: 'Button', ref: 'open', props: { variant: 'ink', icon: 'chart' }, children: 'atrium' },
  },
};
