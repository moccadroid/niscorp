import type { LayoutNode } from '@niscorp/nova';

// The topbar: the active screen title on the left; the action search + actions
// on the right. The search is a Popover (dismissed on outside click via
// `closeRef`): a search Input over the action catalog, then a results panel
// rendered whenever the query is non-empty — the matching actions, or a "no
// results" line. Each result is a clickable row carrying its whole record
// (`$.r`), highlighted when its loop `index` matches `$.highlight` (the ↑/↓
// keys). Literal + serializable.
//
// This layout is the FLOOR — the shape for the least-privileged holder of
// the action (a viewer: no write phase, no assistant). Variants enrich
// upward (topbar.full.layout.ts adds the write-path chrome); a variant that
// reduces is authored backwards — it forces deny-it-back in every richer
// role. The pieces are exported so variants compose from the same nodes.

export const topbarTitle: LayoutNode = { component: 'Text', props: { size: 'lg', weight: 620 }, children: '{{$.title}}' };

export const topbarSearch: LayoutNode = {
  component: 'Popover',
  props: { closeRef: 'search-close' },
  children: [
    {
      component: 'Box',
      props: { width: 260 },
      children: {
        component: 'Input',
        ref: 'search',
        model: '$.search',
        props: { placeholder: 'Search actions…', debounce: 200 },
      },
    },
    {
      if: '$.search',
      then: {
        component: 'PopoverPanel',
        children: {
          if: '$.results.length',
          then: {
            component: 'Stack',
            props: { gap: 1 },
            children: {
              for: '$.results',
              as: 'r',
              key: 'action_id',
              do: {
                component: 'Grid',
                ref: 'run',
                props: {
                  columns: 1,
                  hover: true,
                  selected: { $eq: ['$.index', '$.highlight'] },
                  value: '$.r',
                },
                children: {
                  component: 'Box',
                  props: { px: 10, py: 7 },
                  children: {
                    component: 'Stack',
                    props: { gap: 1 },
                    children: [
                      { component: 'Text', props: { weight: 500 }, children: '$.r.name' },
                      {
                        component: 'Text',
                        props: { size: 'xs', color: 'mute' },
                        children: '$.r.description',
                      },
                    ],
                  },
                },
              },
            },
          },
          else: {
            component: 'Box',
            props: { px: 12, py: 13 },
            children: {
              component: 'Text',
              props: { size: 'sm', color: 'mute' },
              children: 'No actions found',
            },
          },
        },
      },
    },
  ],
};

export const topbarAssistant: LayoutNode = { component: 'Button', ref: 'assistant', props: { variant: 'ghost', icon: 'sparkles' } };

export const topbarNotifications: LayoutNode = { component: 'Button', ref: 'notifications', props: { variant: 'ghost', icon: 'bell' } };

export const topbarLayout: LayoutNode = {
  component: 'Box',
  props: { px: 18, border: 'bottom', h: 53 },
  children: {
    component: 'Row',
    props: { h: '100%', justify: 'between', align: 'center' },
    children: [
      topbarTitle,
      {
        component: 'Row',
        props: { gap: 10, align: 'center' },
        children: [topbarSearch, topbarNotifications],
      },
    ],
  },
};
