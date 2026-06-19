import type { LayoutNode } from '@niscorp/nova';

// The contact profile panel — as rich as the company profile and the deal
// workspace, and styled to match: a header with Edit, the company cross-link +
// contact details, then the contact's open deals, open tasks and a recent
// activity feed (the same type-coloured dots as the deal modal). Loads by id:
// the action runs four reads into `$.view` ({ record, deals, tasks, activity }).
// The root Box IS the panel chrome (fixed width + left border) — it exists only
// while this action is on the `detail` canvas, so the pane collapses on close.

const label = (text: string): LayoutNode => ({
  component: 'Text',
  props: { size: 'xs', weight: 600, color: 'mute', upper: true },
  children: text,
});

// One activity row — a type-coloured dot (call/email/meeting/note) + subject and
// who/when. Identical treatment to the deal workspace's feed.
const activityRow: LayoutNode = {
  component: 'Row',
  props: { gap: 10, align: 'center' },
  children: [
    {
      component: 'Box',
      props: { class: 'rl-actdot rl-actdot--{{$.a.tone}}' },
      children: {
        if: { $eq: ['$.a.type', 'call'] },
        then: { component: 'Icon', props: { name: 'phone', size: 14 } },
        else: {
          if: { $eq: ['$.a.type', 'email'] },
          then: { component: 'Icon', props: { name: 'mail', size: 14 } },
          else: {
            if: { $eq: ['$.a.type', 'meeting'] },
            then: { component: 'Icon', props: { name: 'calendar', size: 14 } },
            else: { component: 'Icon', props: { name: 'edit', size: 14 } },
          },
        },
      },
    },
    {
      component: 'Stack',
      props: { gap: 1, grow: true },
      children: [
        { component: 'Text', props: { size: 'sm' }, children: '{{$.a.subject}}' },
        { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.a.owner}} · {{$.a.when}}' },
      ],
    },
  ],
};

export const contactDetailLayout: LayoutNode = {
  component: 'Box',
  props: { width: 'min(560px, 46vw)', h: '100%', scroll: true, border: 'left' },
  children: {
    component: 'Stack',
    props: { pad: 22, gap: 20 },
    children: [
      // ── Header (close always available; identity skeletons while loading) ──
      {
        component: 'Row',
        props: { justify: 'between', align: 'start' },
        children: [
          {
            if: '$.loading',
            then: {
              component: 'Row',
              props: { gap: 12 },
              children: [
                { component: 'Skeleton', props: { width: 40, height: 40 } },
                { component: 'Stack', props: { gap: 6 }, children: [{ component: 'Skeleton', props: { width: 130, height: 14 } }, { component: 'Skeleton', props: { width: 80, height: 12 } }] },
              ],
            },
            else: {
              component: 'Row',
              props: { gap: 12 },
              children: [
                { component: 'Avatar', props: { name: '$.view.record.name', size: 'lg' } },
                {
                  component: 'Stack',
                  props: { gap: 2 },
                  children: [
                    { component: 'Text', props: { size: 'lg', weight: 650 }, children: '$.view.record.name' },
                    { component: 'Text', props: { size: 'sm', color: 'dim' }, children: '$.view.record.title' },
                  ],
                },
              ],
            },
          },
          {
            component: 'Row',
            props: { gap: 6, align: 'center' },
            children: [
              { component: 'Button', ref: 'edit', props: { variant: 'default', size: 'sm', icon: 'edit' }, children: 'Edit' },
              { component: 'Button', ref: 'close', props: { variant: 'ghost', size: 'sm' }, children: '✕' },
            ],
          },
        ],
      },
      // ── Body ──
      {
        if: '$.loading',
        then: { component: 'Stack', props: { gap: 18 }, children: [{ component: 'Skeleton', props: { width: 150 } }, { component: 'Skeleton', props: { width: 210 } }, { component: 'Skeleton', props: { width: '70%' } }] },
        else: {
          component: 'Stack',
          props: { gap: 22 },
          children: [
            // Company cross-link
            {
              component: 'Stack',
              props: { gap: 5 },
              children: [
                label('Company'),
                {
                  if: '$.view.record.company.company_id',
                  then: { component: 'LinkRow', ref: 'open-company', props: { value: '$.view.record.company.company_id' }, children: { component: 'Row', props: { gap: 9, align: 'center' }, children: [{ component: 'Avatar', props: { name: '$.view.record.company.name', size: 'sm' } }, { component: 'Text', props: { size: 'sm', weight: 500 }, children: '$.view.record.company.name' }] } },
                  else: { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'No company' },
                },
              ],
            },
            // Email + Phone, two-up
            {
              component: 'Row',
              props: { gap: 32, wrap: true },
              children: [
                {
                  component: 'Stack',
                  props: { gap: 5 },
                  children: [label('Email'), { component: 'Text', props: { mono: true, size: 'sm', color: 'secondary' }, children: '$.view.record.email' }],
                },
                {
                  component: 'Stack',
                  props: { gap: 5 },
                  children: [label('Phone'), { component: 'Text', props: { mono: true, size: 'sm', color: 'secondary' }, children: '$.view.record.phone' }],
                },
              ],
            },
            // Deals (any status — the badge is coloured by status so won/lost read
            // clearly, and a closed deal's activity has a visible source).
            {
              component: 'Stack',
              props: { gap: 8 },
              children: [
                label('Deals · {{$.view.deals.length}}'),
                {
                  if: '$.view.deals.length',
                  then: {
                    component: 'Stack',
                    props: { gap: 2 },
                    children: {
                      for: '$.view.deals',
                      as: 'd',
                      key: 'deal_id',
                      do: {
                        component: 'LinkRow',
                        ref: 'open-deal',
                        props: { value: '$.d.deal_id' },
                        children: {
                          component: 'Row',
                          props: { justify: 'between', align: 'center', gap: 10 },
                          children: [
                            { component: 'Text', props: { size: 'sm', weight: 500 }, children: '$.d.title' },
                            {
                              component: 'Row',
                              props: { gap: 8, align: 'center' },
                              children: [
                                { component: 'Badge', props: { tone: '$.d.tone' }, children: '$.d.stage' },
                                { component: 'Text', props: { size: 'sm', weight: 600, mono: true }, children: '$.d.value_display' },
                              ],
                            },
                          ],
                        },
                      },
                    },
                  },
                  else: { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'No deals' },
                },
              ],
            },
            // Tasks
            {
              component: 'Stack',
              props: { gap: 8 },
              children: [
                label('Open tasks · {{$.view.tasks.length}}'),
                {
                  if: '$.view.tasks.length',
                  then: {
                    component: 'Stack',
                    props: { gap: 0 },
                    children: {
                      for: '$.view.tasks',
                      as: 't',
                      key: 'task_id',
                      do: {
                        component: 'Box',
                        props: { py: 8, border: 'bottom' },
                        children: {
                          component: 'Row',
                          props: { justify: 'between', align: 'center', gap: 10 },
                          children: [
                            { component: 'Row', props: { gap: 9, align: 'center' }, children: [{ component: 'Button', ref: 'complete-task', props: { variant: 'ghost', size: 'sm', icon: 'circle-dot', value: '$.t.task_id' } }, { component: 'Text', props: { size: 'sm' }, children: '{{$.t.title}}' }] },
                            { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.t.due_date}}' },
                          ],
                        },
                      },
                    },
                  },
                  else: { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'No open tasks' },
                },
              ],
            },
            // Activity
            {
              component: 'Stack',
              props: { gap: 8 },
              children: [
                label('Activity'),
                {
                  if: '$.view.activity.length',
                  then: { component: 'Stack', props: { gap: 13 }, children: { for: '$.view.activity', as: 'a', key: 'activity_id', do: activityRow } },
                  else: { component: 'Text', props: { size: 'sm', color: 'dim' }, children: 'No activity logged' },
                },
              ],
            },
          ],
        },
      },
    ],
  },
};
