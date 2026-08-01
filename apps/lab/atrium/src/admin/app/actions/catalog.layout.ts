import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice, nothingChosen, chips } from './panel';

export const catalogLayout: LayoutNode = panel(
  'Catalog',
  'Every action the server serves — declared data, input contract, wiring, and the layout itself',
  split(
    // ── left: the whole catalog, filterable ──
    {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        errorNotice,
        { component: 'Input', ref: 'filter', props: { placeholder: 'Filter by id or title…', icon: 'search', debounce: 200 } },
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'id',
            rowRef: 'pick',
            loading: '$.loading',
            dense: true,
            empty: 'Nothing matches.',
            columns: [
              { label: 'Action', w: 3, cell: { kind: 'primary', key: 'id', subKey: 'title' } },
              { label: 'From', w: 1, cell: { kind: 'chip', key: 'source', toneKey: 'tone' } },
            ],
          },
        },
      ],
    },

    // ── right: one definition, opened up ──
    {
      if: '$.selected.id',
      then: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Row',
            props: { justify: 'between', align: 'start', gap: 12, wrap: true },
            children: [
              {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.selected.title' },
                  { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.selected.id}} · {{$.detail.summary}}' },
                ],
              },
              {
                component: 'Button',
                ref: 'render',
                props: { icon: 'sparkle', disabled: '$.working' },
                children: { if: '$.working', then: 'Preparing…', else: 'Preview the layout' },
              },
            ],
          },

          // The rule-14 contract: what an opener may set, versus everything the
          // action holds. The difference is the interesting part — data an
          // action keeps but does not accept is data nobody outside can aim.
          {
            component: 'Grid',
            props: { min: 240, gap: 14 },
            children: [
              chips('Input contract — what an opener may set', '$.detail.input', 'accent'),
              chips('Declared data — everything it holds', '$.detail.data'),
            ],
          },

          chips('Components its layout names', '$.detail.components', 'neutral'),

          {
            if: '$.detail.endpoints.length',
            then: {
              component: 'Stack',
              props: { gap: 6 },
              children: [
                { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Endpoints — where its data comes from' },
                {
                  component: 'Rows',
                  props: {
                    rows: '$.detail.endpoints',
                    rowKey: 'name',
                    dense: true,
                    columns: [
                      { label: 'Name', w: 1, cell: { kind: 'primary', key: 'name', subKey: 'target' } },
                      { label: 'Reaches', w: 2, cell: { kind: 'text', key: 'reaches' } },
                    ],
                  },
                },
              ],
            },
            else: '',
          },

          {
            if: '$.detail.triggers.length',
            then: {
              component: 'Stack',
              props: { gap: 6 },
              children: [
                { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Triggers — what it responds to' },
                {
                  component: 'Rows',
                  props: {
                    rows: '$.detail.triggers',
                    rowKey: 'on',
                    dense: true,
                    columns: [
                      { label: 'On', w: 1, cell: { kind: 'text', key: 'on' } },
                      { label: 'Does', w: 2, cell: { kind: 'text', key: 'does' } },
                    ],
                  },
                },
              ],
            },
            else: '',
          },
        ],
      },
      else: nothingChosen('Pick an action to see its contract, its wiring, and a live preview of its layout.'),
    },
  ),
);
