import type { LayoutNode } from '@niscorp/nova';

// The deals board view — the pipeline Kanban, a pure Nova layout (no grouping
// code). A forecast bar (total + weighted, assembled in `loadSummary`), then a
// column per open stage (`$.stages`) with its count + win-% + total and a
// stage-coloured top accent. Cards are ALL open deals (`$.deals`) filtered
// into each column in-layout by `{$eq:[d.stage, col.stage]}`. A card click opens
// the deal workspace; a card drag fires `ui:drop`. Gated on `$.boardLoading` (the
// table view has its own `$.loading`). One of the two layouts the `deals` action
// renders (see deals.layout.ts).

const skeletonColumn: LayoutNode = {
  component: 'Box',
  props: { class: 'rl-kanban__col' },
  children: [
    { component: 'Box', props: { class: 'rl-kanban__head' }, children: { component: 'Skeleton', props: { width: '50%' } } },
    { component: 'Box', props: { class: 'rl-kanban__cards' }, children: { component: 'Stack', props: { gap: 8 }, children: [{ component: 'Skeleton', props: { width: '100%', height: 54 } }, { component: 'Skeleton', props: { width: '100%', height: 54 } }] } },
  ],
};

export const dealsBoardLayout: LayoutNode = {
  if: '$.boardLoading',
  then: { component: 'Box', props: { class: 'rl-kanban' }, children: { for: [1, 1, 1, 1], as: 's', do: skeletonColumn } },
  else: {
    component: 'Stack',
    props: { gap: 16, h: '100%' },
    children: [
      // ── Forecast bar ──
      {
        component: 'Row',
        props: { gap: 8, align: 'baseline', wrap: true },
        children: [
          { component: 'Text', props: { size: 'xl', weight: 680 }, children: '{{$.summary.total}}' },
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'total pipeline' },
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '·' },
          { component: 'Text', props: { size: 'xl', weight: 680, color: 'accent' }, children: '{{$.summary.weighted}}' },
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'weighted' },
        ],
      },
      // ── Columns ──
      {
        component: 'Box',
        props: { class: 'rl-kanban rl-min0', grow: true },
        children: {
          for: '$.stages',
          as: 'col',
          key: 'stage',
          do: {
            component: 'Box',
            props: { class: 'rl-kanban__col rl-kanban__col--{{$.col.tone}}' },
            children: [
              {
                component: 'Box',
                props: { class: 'rl-kanban__head' },
                children: [
                  {
                    component: 'Stack',
                    props: { gap: 1 },
                    children: [
                      { component: 'Text', props: { size: 'sm', weight: 600 }, children: '{{$.col.stage}}' },
                      { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.col.count}} deals · {{$.col.prob}}%' },
                    ],
                  },
                  { component: 'Text', props: { size: 'sm', weight: 640 }, children: '{{$.col.value}}' },
                ],
              },
              {
                component: 'DropZone',
                ref: 'move-deal',
                props: { value: '$.col.stage_id', class: 'rl-kanban__cards' },
                children: {
                  for: '$.deals',
                  as: 'd',
                  key: 'deal_id',
                  do: {
                    if: { $eq: ['$.d.stage', '$.col.stage'] },
                    then: {
                      component: 'Draggable',
                      ref: 'card',
                      props: { value: '$.d.deal_id', class: 'rl-kanban__card' },
                      children: {
                        component: 'Stack',
                        props: { gap: 9 },
                        children: [
                          {
                            component: 'Row',
                            props: { justify: 'between', align: 'center', gap: 8 },
                            children: [
                              { component: 'Text', props: { size: 'sm', weight: 560 }, children: '{{$.d.company}}' },
                              { component: 'Text', props: { size: 'sm', weight: 640, mono: true }, children: '{{$.d.value_display}}' },
                            ],
                          },
                          {
                            component: 'Row',
                            props: { justify: 'between', align: 'center', gap: 8 },
                            children: [
                              { component: 'Text', props: { size: 'xs', color: 'mute' }, children: 'Closes {{$.d.close_date}}' },
                              { component: 'Avatar', props: { name: '$.d.owner', size: 'sm' } },
                            ],
                          },
                        ],
                      },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    ],
  },
};
