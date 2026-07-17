import type { LayoutNode } from '@niscorp/nova';

// The inspector's layout — CONTENT ONLY. The panel, sticky title, and ✕ come
// from the `devtools.frame` fragment it is always pushed with; this tree drops
// into the fragment's `{ slot: 'body' }`.

const RED = '#e8a1a1';
const DIM = '#7d8b99';

const section = (label: string, body: LayoutNode): LayoutNode => ({
  component: 'Stack',
  props: { gap: 3 },
  children: [{ component: 'Text', props: { size: 'xs', upper: true, color: 'secondary' }, children: label }, body],
});

// A row with a json toggle button, tree expanding BELOW the row (not beside it).
const jsonRow = (rowChildren: LayoutNode[], key: string, value: string): LayoutNode => ({
  component: 'Stack',
  props: { gap: 2 },
  children: [
    {
      component: 'Row',
      props: { gap: 8, align: 'center' },
      children: [
        ...rowChildren,
        {
          component: 'Button',
          ref: 'json',
          props: { size: 'sm', variant: 'ghost', value: { $if: { $eq: ['$.openJson', key] }, $then: '', $else: key } },
          children: { if: { $eq: ['$.openJson', key] }, then: 'hide', else: 'json' },
        },
      ],
    },
    { if: { $eq: ['$.openJson', key] }, then: { component: 'JsonTree', props: { value } } },
  ],
});

const issueRow: LayoutNode = {
  component: 'Row',
  props: { gap: 6, align: 'center' },
  children: [
    {
      if: '$.i.info',
      then: { component: 'Badge', children: '{{$.i.tag}}' },
      else: { component: 'Badge', props: { tone: 'red' }, children: 'fix' },
    },
    { component: 'Text', props: { size: 'sm', color: { $if: '$.i.info', $then: DIM, $else: RED } }, children: '{{$.i.issue}}' },
  ],
};

export const inspectLayout: LayoutNode = {
  if: '$.target.found',
  then: {
    component: 'Stack',
    props: { gap: 10 },
    children: [
      {
        component: 'Row',
        props: { gap: 8, align: 'center' },
        children: [
          {
            component: 'Badge',
            props: { tone: { $if: { $eq: ['$.target.status', 'active'] }, $then: 'green', $else: 'slate' } },
            children: '{{$.target.status}}',
          },
          { component: 'Text', props: { size: 'xs', color: 'secondary', truncate: true }, children: 'canvas {{$.target.canvasId}} · {{$.target.instanceId}}' },
          { component: 'Box', props: { grow: true } },
          { component: 'Button', ref: 'refresh', props: { size: 'sm', variant: 'ghost' }, children: '↻' },
        ],
      },

      // no `label` — a literal '$' would resolve as a bare binding path to the
      // ROOT data object; the primitive defaults the label after resolution
      section('data', { component: 'JsonTree', props: { value: '$.target.data' } }),

      section('endpoints', {
        component: 'Stack',
        props: { gap: 2 },
        children: {
          for: '$.target.endpoints',
          as: 'ep',
          key: 'name',
          do: {
            component: 'Stack',
            props: { gap: 2 },
            children: [
              {
                component: 'Row',
                props: { gap: 8, align: 'center' },
                children: [
                  { component: 'Text', props: { size: 'sm', mono: true, weight: 600 }, children: '{{$.ep.name}}' },
                  { component: 'Text', props: { size: 'xs', color: 'secondary', truncate: true }, children: '{{$.ep.summary}}' },
                  {
                    component: 'Button',
                    ref: 'json',
                    props: { size: 'sm', variant: 'ghost', value: { $if: { $eq: ['$.openJson', '$.ep.name'] }, $then: '', $else: '$.ep.name' } },
                    children: { if: { $eq: ['$.openJson', '$.ep.name'] }, then: 'hide', else: 'json' },
                  },
                ],
              },
              { if: { $eq: ['$.openJson', '$.ep.name'] }, then: { component: 'JsonTree', props: { value: '$.ep.config', label: '{{$.ep.name}}' } } },
            ],
          },
        },
      }),

      section('triggers', {
        component: 'Stack',
        props: { gap: 4 },
        children: {
          for: '$.target.triggers',
          as: 'tr',
          do: {
            component: 'Stack',
            props: { gap: 1 },
            children: [
              { component: 'Text', props: { size: 'sm', mono: true, color: '#d3b58f' }, children: '{{$.tr.on}}' },
              { for: '$.tr.steps', as: 'st', do: { component: 'Text', props: { size: 'xs', color: 'secondary' }, children: '· {{$.st}}' } },
            ],
          },
        },
      }),

      section('lifecycle', {
        component: 'Stack',
        props: { gap: 2 },
        children: {
          for: '$.target.lifecycle',
          as: 'lc',
          key: 'hook',
          do: {
            component: 'Stack',
            props: { gap: 2 },
            children: [
              {
                component: 'Row',
                props: { gap: 8, align: 'center' },
                children: [
                  { component: 'Text', props: { size: 'sm', mono: true, weight: 600 }, children: '{{$.lc.hook}}' },
                  { component: 'Text', props: { size: 'xs', color: 'secondary' }, children: '{{$.lc.count}} steps' },
                  {
                    component: 'Button',
                    ref: 'json',
                    props: { size: 'sm', variant: 'ghost', value: { $if: { $eq: ['$.openJson', '$.lc.hook'] }, $then: '', $else: '$.lc.hook' } },
                    children: { if: { $eq: ['$.openJson', '$.lc.hook'] }, then: 'hide', else: 'json' },
                  },
                ],
              },
              { if: { $eq: ['$.openJson', '$.lc.hook'] }, then: { component: 'JsonTree', props: { value: '$.lc.steps', label: '{{$.lc.hook}}' } } },
            ],
          },
        },
      }),

      section(
        'layout',
        jsonRow([{ component: 'Text', props: { size: 'xs', color: 'secondary' }, children: '{{$.target.layoutKind}}' }], 'layout', '$.target.layout'),
      ),

      {
        if: '$.target.input',
        then: section(
          'input contract',
          jsonRow([{ component: 'Text', props: { size: 'xs', color: 'secondary' }, children: 'openable-input schema' }], 'input', '$.target.input'),
        ),
      },

      section('audit', {
        component: 'Stack',
        props: { gap: 2 },
        children: [
          {
            if: { $eq: ['$.target.issueCount', 0] },
            then: { component: 'Text', props: { size: 'sm', color: 'secondary' }, children: 'ok — no issues' },
          },
          { for: '$.target.issues', as: 'i', do: issueRow },
        ],
      }),

      {
        component: 'Row',
        props: { gap: 4 },
        children: [{ component: 'Button', ref: 'log-instance', props: { size: 'sm' }, children: 'log to console' }],
      },
    ],
  },
  else: { component: 'Text', props: { size: 'sm', color: 'secondary' }, children: 'instance gone — {{$.instanceId}}' },
};
