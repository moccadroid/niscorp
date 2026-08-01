import type { LayoutNode } from '@niscorp/nova';
import { panel, split, errorNotice, nothingChosen, chips } from './panel';

export const entriesLayout: LayoutNode = panel(
  'Entries',
  'Every read and write the app can make — warm-only, so this list IS the API',
  split(
    // ── left: the whole API, filterable ──
    {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        errorNotice,
        { component: 'Input', ref: 'filter', props: { placeholder: 'Filter by fingerprint or intent…', icon: 'search', debounce: 200 } },

        // Called, never seeded. First, because in a warm-only app it is not a
        // warning — it is a 500 nobody has clicked yet.
        {
          if: '$.api.missing.length',
          then: {
            component: 'Notice',
            props: { tone: 'alert', icon: 'alert', title: '{{$.api.missing.length}} called but never seeded' },
            children: {
              component: 'Stack',
              props: { gap: 2 },
              children: {
                for: '$.api.missing',
                as: 'm',
                key: 'fingerprint',
                do: { component: 'Text', props: { size: 'xs' }, children: '{{$m.fingerprint}} — called by {{$m.by}}' },
              },
            },
          },
          else: '',
        },

        {
          component: 'Rows',
          props: {
            rows: '$.api.entries',
            rowKey: 'fingerprint',
            rowRef: 'pick',
            loading: '$.loading',
            dense: true,
            empty: 'Nothing matches.',
            columns: [
              { label: 'Fingerprint', w: 3, cell: { kind: 'primary', key: 'fingerprint', subKey: 'intent' } },
              { label: '', w: 1, cell: { kind: 'chip', key: 'badge', toneKey: 'tone' } },
            ],
          },
        },
      ],
    },

    // ── right: one entry, opened up ──
    {
      if: '$.selected.fingerprint',
      then: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            component: 'Stack',
            props: { gap: 2 },
            children: [
              { component: 'Text', props: { serif: true, size: 'xl' }, children: '$.selected.fingerprint' },
              { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.selected.intent' },
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: '{{$.selected.kind}} · shipped by {{$.selected.source}}' },
            ],
          },

          {
            component: 'Grid',
            props: { min: 220, gap: 14 },
            children: [
              chips('Context it binds — what a caller must supply', '$.selected.context', 'accent'),
              chips('Tables it touches', '$.selected.tables'),
              chips('Shape it returns', '$.selected.shape'),
            ],
          },

          // Who calls it — and the orphan case, which is the finding.
          {
            if: '$.selected.callers.length',
            then: {
              component: 'Stack',
              props: { gap: 6 },
              children: [
                { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'Called by' },
                {
                  component: 'Rows',
                  props: {
                    rows: '$.selected.callers',
                    rowKey: 'label',
                    dense: true,
                    columns: [
                      { label: 'Action', w: 2, cell: { kind: 'primary', key: 'action', subKey: 'endpoint' } },
                      { label: 'Through', w: 2, cell: { kind: 'text', key: 'url' } },
                    ],
                  },
                },
              ],
            },
            else: {
              component: 'Notice',
              props: { tone: 'warn', icon: 'alert', title: 'Nothing calls this' },
              children: 'Seeded and reachable, but no action names it. Either dead weight, or a surface somebody never wired.',
            },
          },

          {
            component: 'Stack',
            props: { gap: 6 },
            children: [
              { component: 'Text', props: { size: 'xs', color: 'faint' }, children: 'The entry, as seeded' },
              { component: 'Code', props: { text: '$.selected.json', max: 380 } },
            ],
          },
        ],
      },
      else: nothingChosen('Pick an entry to see what it binds, what it touches, and who calls it.'),
    },
  ),
);
