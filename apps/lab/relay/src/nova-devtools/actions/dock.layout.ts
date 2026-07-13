import type { LayoutNode } from '@niscorp/nova';

// The dock's layout — pure Nova. Composes the host app's generic primitives
// (Stack/Row/Text/Badge/Button) plus two devtools primitives (DevtoolsPanel,
// JsonTree). Porting to another framework = reimplementing those primitives;
// this file ships unchanged.

const RED = '#e8a1a1';
const DIM = '#7d8b99';

const tabButton = (ref: string, tab: string, label: string): LayoutNode => ({
  component: 'Button',
  ref,
  props: { size: 'sm', variant: { $if: { $eq: ['$.tab', tab] }, $then: 'primary', $else: 'ghost' } },
  children: label,
});

// ── shell tab ───────────────────────────────────────────────

const shellTab: LayoutNode = {
  component: 'Stack',
  props: { gap: 10 },
  children: [
    {
      for: '$.shell.canvases',
      as: 'cv',
      key: 'id',
      do: {
        component: 'Stack',
        props: { gap: 2 },
        children: [
          {
            component: 'Row',
            props: { justify: 'between' },
            children: [
              { component: 'Text', props: { size: 'xs', upper: true, color: 'secondary' }, children: '{{$.cv.id}}' },
              { component: 'Text', props: { size: 'xs', color: 'secondary' }, children: 'depth {{$.cv.depth}}' },
            ],
          },
          {
            for: '$.cv.items',
            as: 'it',
            key: 'instanceId',
            do: {
              component: 'Row',
              props: { gap: 8, align: 'center' },
              children: [
                { component: 'Button', ref: 'inspect', props: { size: 'sm', variant: 'ghost', value: '$.it.instanceId' }, children: '⚙' },
                { component: 'Text', props: { size: 'sm', mono: true }, children: '{{$.it.definitionId}}' },
                { component: 'Text', props: { size: 'xs', color: 'secondary', truncate: true }, children: '{{$.it.instanceId}} · {{$.it.status}}' },
                { if: '$.it.active', then: { component: 'Badge', props: { tone: 'green' }, children: 'active' } },
              ],
            },
          },
          { if: { $eq: ['$.cv.depth', 0] }, then: { component: 'Text', props: { size: 'xs', color: 'secondary' }, children: 'empty' } },
        ],
      },
    },
    { component: 'Text', props: { size: 'xs', color: 'secondary' }, children: 'layout store: {{$.shell.layouts}}' },
  ],
};

// ── timeline tab ────────────────────────────────────────────

const filterButton = (ref: string, flag: string, label: string): LayoutNode => ({
  component: 'Button',
  ref,
  props: { size: 'sm', variant: { $if: `$.${flag}`, $then: 'default', $else: 'ghost' } },
  children: label,
});

const timelineRow: LayoutNode = {
  component: 'Stack',
  props: { gap: 2 },
  children: [
    {
      component: 'Row',
      props: { gap: 8, align: 'center' },
      children: [
        { component: 'Text', props: { size: 'xs', mono: true, color: 'secondary' }, children: '{{$.row.time}}' },
        { component: 'Badge', props: { tone: '$.row.tone' }, children: '{{$.row.badge}}' },
        { component: 'Text', props: { size: 'sm', truncate: true }, children: '{{$.row.label}}' },
        {
          component: 'Button',
          ref: 'expand',
          // toggles: clicking the open row's button closes it (0 = none open)
          props: { size: 'sm', variant: 'ghost', value: { $if: { $eq: ['$.expanded', '$.row.id'] }, $then: 0, $else: '$.row.id' } },
          children: { if: { $eq: ['$.expanded', '$.row.id'] }, then: '×', else: '⋯' },
        },
      ],
    },
    {
      if: { $eq: ['$.expanded', '$.row.id'] },
      then: {
        component: 'Stack',
        props: { gap: 2, pad: 4 },
        children: { component: 'JsonTree', props: { value: '$.row.detail', label: 'detail' } },
      },
    },
  ],
};

const timelineTab: LayoutNode = {
  component: 'Stack',
  props: { gap: 6 },
  children: [
    {
      component: 'Row',
      props: { gap: 4, align: 'center', justify: 'between' },
      children: [
        {
          component: 'Row',
          props: { gap: 4 },
          children: [
            filterButton('filter-nav', 'showNav', 'nav'),
            filterButton('filter-data', 'showData', 'data'),
            filterButton('filter-net', 'showNet', 'net'),
          ],
        },
        {
          component: 'Row',
          props: { gap: 4 },
          children: [
            {
              component: 'Button',
              ref: 'pause',
              props: { size: 'sm', variant: { $if: '$.paused', $then: 'default', $else: 'ghost' } },
              children: { if: '$.paused', then: 'paused +{{$.view.behind}}', else: 'pause' },
            },
            { component: 'Button', ref: 'clear', props: { size: 'sm', variant: 'ghost' }, children: 'clear' },
          ],
        },
      ],
    },
    { component: 'Text', props: { size: 'xs', color: 'secondary' }, children: '{{$.view.total}} entries' },
    {
      if: { $eq: ['$.view.total', 0] },
      then: { component: 'Text', props: { size: 'sm', color: 'secondary' }, children: 'nothing yet — interact with the app' },
    },
    { for: '$.view.rows', as: 'row', key: 'id', do: timelineRow },
  ],
};

// ── audit tab ───────────────────────────────────────────────

const issueRow: LayoutNode = {
  component: 'Row',
  props: { gap: 6, align: 'center' },
  children: [
    {
      if: '$.i.info',
      then: { component: 'Badge', children: '{{$.i.tag}}' },
      else: { component: 'Badge', props: { tone: 'red' }, children: 'fix' },
    },
    {
      component: 'Text',
      props: { size: 'sm', color: { $if: '$.i.info', $then: DIM, $else: RED } },
      children: '{{$.i.issue}}',
    },
  ],
};

const auditTab: LayoutNode = {
  component: 'Stack',
  props: { gap: 6 },
  children: [
    {
      component: 'Row',
      props: { gap: 4, align: 'center', justify: 'between' },
      children: [
        {
          component: 'Text',
          props: { size: 'sm', color: { $if: '$.audit.address', $then: RED, $else: 'secondary' } },
          children: '{{$.audit.address}} to address · {{$.audit.explained}} explained',
        },
        {
          component: 'Row',
          props: { gap: 4 },
          children: [
            {
              component: 'Button',
              ref: 'copy-report',
              props: { size: 'sm', variant: 'ghost' },
              children: { if: '$.copied', then: 'copied ✓', else: 'copy report' },
            },
            { component: 'Button', ref: 'log-report', props: { size: 'sm', variant: 'ghost' }, children: 'log' },
          ],
        },
      ],
    },
    {
      for: '$.audit.rows',
      as: 'r',
      key: 'id',
      do: {
        component: 'Stack',
        props: { gap: 2 },
        children: [
          {
            component: 'Row',
            props: { gap: 8, align: 'center' },
            children: [
              {
                component: 'Button',
                ref: 'audit-open',
                // toggles: clicking the open definition's button closes it
                props: { size: 'sm', variant: 'ghost', value: { $if: { $eq: ['$.auditOpen', '$.r.id'] }, $then: '', $else: '$.r.id' } },
                children: '{{$.r.id}}',
              },
              {
                component: 'Text',
                props: { size: 'xs', color: { $if: '$.r.address', $then: RED, $else: 'secondary' } },
                children: {
                  if: '$.r.address',
                  then: '{{$.r.address}} to address',
                  else: 'explained only',
                },
              },
            ],
          },
          { if: { $eq: ['$.auditOpen', '$.r.id'] }, then: { for: '$.r.issues', as: 'i', do: issueRow } },
        ],
      },
    },
  ],
};

// ── root: pill ⇄ panel ──────────────────────────────────────

export const dockLayout: LayoutNode = {
  if: '$.open',
  then: {
    component: 'DevtoolsPanel',
    children: {
      // The tab row stays put; only the tab body scrolls (`shrink` lets this
      // stack shrink inside the height-capped panel so the inner scroll works).
      component: 'Stack',
      props: { gap: 8, shrink: true },
      children: [
        {
          component: 'Row',
          props: { gap: 4, align: 'center' },
          children: [
            tabButton('tab-shell', 'shell', 'shell'),
            tabButton('tab-timeline', 'timeline', 'timeline'),
            tabButton('tab-audit', 'audit', 'audit'),
            { component: 'Box', props: { grow: true } },
            { component: 'Button', ref: 'dock-toggle', props: { size: 'sm', variant: 'ghost' }, children: '✕' },
          ],
        },
        {
          component: 'Box',
          props: { grow: true, scroll: true },
          children: [
            { if: { $eq: ['$.tab', 'shell'] }, then: shellTab },
            { if: { $eq: ['$.tab', 'timeline'] }, then: timelineTab },
            { if: { $eq: ['$.tab', 'audit'] }, then: auditTab },
          ],
        },
      ],
    },
  },
  else: { component: 'Button', ref: 'dock-toggle', props: { size: 'sm', variant: 'ghost' }, children: '⚙ nova devtools' },
};
