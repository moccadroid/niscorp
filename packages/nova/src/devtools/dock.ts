import type { ActionDefinition } from '@action';
import type { LayoutNode } from '@layout';

// ═══════════════════════════════════════════════════════════
// The devtools dock — pure nova, the ROOT of the devtools canvas's stack. Its
// data is UI state + the reflect fns' results; its layout uses only generic
// primitives (Panel, Grid, Row, Stack, Text, Badge, Button, JsonTree), so it
// renders in ANY terminal — React, DOM, console. Three views, all ACCORDIONS
// (detail opens in place, under the row): the live shell (canvases + the
// shell model itself), the classified audit, and the endpoint timeline. Row
// toggles are pure data: `$if` in the `set` value flips the open cursor.
// Every ⚙ PUSHES a `devtools.inspect` onto this canvas — the inspector is
// stack navigation, not dock state (see inspect.ts). All computation is
// `fn:` (nova/reflect + the recorded telemetry).
//
// The ✕ COLLAPSES (a data flag — the dock stays mounted, rendering as a ⚙
// pill that expands back). Mount/unmount itself belongs to the app's master
// switch (`devtools.setEnabled`, e.g. a settings toggle).
// ═══════════════════════════════════════════════════════════

const dockLayout: LayoutNode = {
  if: '$.collapsed',
  then: { component: 'Button', ref: 'dock-expand', props: { size: 'sm', variant: 'ghost' }, children: '⚙ devtools' },
  else: {
  component: 'Panel',
  // the ✕ lives in the Panel HEADER (closeRef — the same prop-ref convention
  // as Table's rowRef); it collapses the dock to the pill
  props: { title: 'devtools', closeRef: 'dock-close' },
  children: {
    component: 'Stack',
    props: { gap: 10 },
    children: [
      {
        component: 'Row',
        props: { gap: 6 },
        children: [
          { component: 'Button', ref: 'tab-shell', props: { size: 'sm', variant: { $if: { $eq: ['$.tab', 'shell'] }, $then: 'primary', $else: 'ghost' } }, children: 'shell' },
          { component: 'Button', ref: 'tab-audit', props: { size: 'sm', variant: { $if: { $eq: ['$.tab', 'audit'] }, $then: 'primary', $else: 'ghost' } }, children: 'audit' },
          { component: 'Button', ref: 'tab-timeline', props: { size: 'sm', variant: { $if: { $eq: ['$.tab', 'timeline'] }, $then: 'primary', $else: 'ghost' } }, children: 'timeline' },
        ],
      },

      // ── shell: the live canvases + the shell model, as accordions ──
      {
        if: { $eq: ['$.tab', 'shell'] },
        then: {
          component: 'Stack',
          props: { gap: 4 },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'the live shell — a row opens its stack; ⚙ inspects an instance' },
            // the shell model itself (layout store, component registry)
            {
              component: 'Grid',
              ref: 'shell-open',
              props: { value: 'shell', hover: true, weights: [1, 'auto'], gap: 8, selected: { $eq: ['$.shellOpen', 'shell'] } },
              children: [
                { component: 'Text', props: { weight: 600, size: 'sm' }, children: 'shell model' },
                { component: 'Text', props: { size: 'xs', color: 'mute' }, children: 'layouts · components' },
              ],
            },
            {
              if: { $eq: ['$.shellOpen', 'shell'] },
              then: {
                component: 'Stack',
                props: { gap: 4, pad: 6 },
                children: [
                  { component: 'JsonTree', props: { value: '$.shell.layouts', label: 'layout store' } },
                  { component: 'JsonTree', props: { value: '$.shell.components', label: 'registry' } },
                ],
              },
            },
            // each canvas: a row that opens its stack in place
            {
              for: '$.shell.canvases',
              as: 'c',
              key: 'id',
              do: {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  {
                    component: 'Grid',
                    ref: 'shell-open',
                    props: { value: '$.c.id', hover: true, weights: [1, 'auto'], gap: 8, selected: { $eq: ['$.shellOpen', '$.c.id'] } },
                    children: [
                      { component: 'Text', props: { weight: 600, size: 'sm' }, children: '$.c.id' },
                      { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '{{$.c.depth}} mounted' },
                    ],
                  },
                  {
                    if: { $eq: ['$.shellOpen', '$.c.id'] },
                    then: {
                      component: 'Stack',
                      props: { gap: 2, pad: 6 },
                      children: [
                        // stack navigation: pop the top (only shown when
                        // there's something beneath it — never empties a canvas)
                        {
                          if: '$.c.items.1',
                          then: { component: 'Button', ref: 'canvas-back', props: { size: 'sm', variant: 'ghost', value: '$.c.id' }, children: '← pop {{$.c.items.0.definitionId}}' },
                        },
                        {
                          for: '$.c.items',
                          as: 'i',
                          key: 'instanceId',
                          do: {
                            component: 'Row',
                            props: { gap: 8, align: 'center' },
                            children: [
                              { component: 'Button', ref: 'inspect', props: { size: 'sm', variant: 'ghost', value: '$.i.instanceId' }, children: '⚙ {{$.i.definitionId}}' },
                              { component: 'Badge', children: '$.i.status' },
                              // stack position, not status — 'top' receives events
                              { if: '$.i.active', then: { component: 'Badge', children: 'top' } },
                              { component: 'Text', props: { size: 'xs', color: 'mute', mono: true }, children: '$.i.instanceId' },
                            ],
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },

      // ── audit: static lint of the catalog; a row opens its findings in place ──
      {
        if: { $eq: ['$.tab', 'audit'] },
        then: {
          component: 'Stack',
          props: { gap: 4 },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'static lint of the action catalog — {{$.audit.address}} to address across {{$.audit.definitions}} actions' },
            {
              for: '$.audit.rows',
              as: 'r',
              key: 'id',
              do: {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  {
                    component: 'Grid',
                    ref: 'audit-open',
                    props: { value: '$.r.id', hover: true, weights: [1, 'auto'], gap: 8, selected: { $eq: ['$.auditOpen', '$.r.id'] } },
                    children: [
                      { component: 'Text', props: { weight: 600, size: 'sm' }, children: '$.r.id' },
                      { component: 'Text', props: { size: 'sm' }, children: '$.r.address' },
                    ],
                  },
                  {
                    if: { $eq: ['$.auditOpen', '$.r.id'] },
                    then: {
                      component: 'Stack',
                      props: { gap: 4, pad: 6 },
                      children: {
                        for: '$.r.issues',
                        as: 'f',
                        do: {
                          component: 'Row',
                          props: { gap: 8, align: 'start' },
                          children: [
                            { component: 'Badge', children: '$.f.kind' },
                            {
                              component: 'Stack',
                              props: { gap: 1 },
                              children: [
                                { component: 'Text', props: { size: 'sm' }, children: '$.f.issue' },
                                { if: '$.f.reason', then: { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '$.f.reason' } },
                              ],
                            },
                          ],
                        },
                      },
                    },
                  },
                ],
              },
            },
          ],
        },
      },

      // ── timeline: endpoint calls; a row opens its detail in place ──
      {
        if: { $eq: ['$.tab', 'timeline'] },
        then: {
          component: 'Stack',
          props: { gap: 4 },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '{{$.timeline.count}} endpoint calls, newest first (fn = in-process, http = over the wire)' },
            {
              for: '$.timeline.rows',
              as: 't',
              key: 'seq',
              do: {
                component: 'Stack',
                props: { gap: 2 },
                children: [
                  {
                    component: 'Grid',
                    ref: 'timeline-open',
                    props: { value: '$.t.seq', hover: true, weights: [2, 2, 'auto', 'auto'], gap: 8, selected: { $eq: ['$.timelineOpen', '$.t.seq'] } },
                    children: [
                      { component: 'Text', props: { size: 'sm' }, children: '$.t.name' },
                      { component: 'Text', props: { size: 'xs', color: 'mute' }, children: '$.t.action' },
                      { component: 'Badge', children: '$.t.kind' },
                      { component: 'Text', props: { size: 'xs', color: { $if: '$.t.ok', $then: 'mute', $else: 'red' } }, children: '{{$.t.ms}}ms' },
                    ],
                  },
                  {
                    if: { $eq: ['$.timelineOpen', '$.t.seq'] },
                    then: {
                      component: 'Stack',
                      props: { gap: 2, pad: 6 },
                      children: [
                        { component: 'Text', props: { size: 'xs', color: 'mute' }, children: 'endpoint {{$.t.name}} · {{$.t.kind}} · ok {{$.t.ok}} · status {{$.t.status}} · {{$.t.ms}}ms' },
                        { component: 'Text', props: { size: 'xs', color: 'mute' }, children: 'caller {{$.t.action}} on {{$.t.canvasId}}' },
                        { component: 'Text', props: { size: 'xs', color: 'mute', mono: true }, children: '$.t.instanceId' },
                        { component: 'Button', ref: 'inspect', props: { size: 'sm', variant: 'ghost', value: '$.t.instanceId' }, children: '⚙ inspect caller' },
                      ],
                    },
                  },
                ],
              },
            },
          ],
        },
      },

    ],
  },
  },
};

export const dockAction: ActionDefinition = {
  id: 'devtools.dock',
  title: 'devtools',
  data: {
    tab: 'shell',
    collapsed: false,
    popCanvas: '',
    shellOpen: '',
    auditOpen: '',
    timelineOpen: '',
    shell: { canvases: [], layouts: [], components: [] },
    audit: { rows: [], address: 0, definitions: 0 },
    timeline: { rows: [], count: 0 },
  },
  layout: dockLayout,
  endpoints: {
    shellState: { fn: 'devtools.shellState', target: 'shell' },
    audit: { fn: 'devtools.audit', target: 'audit' },
    timeline: { fn: 'devtools.timeline', target: 'timeline' },
    pop: { fn: 'devtools.pop' },
  },
  lifecycle: { mount: [{ call: 'shellState' }, { call: 'audit' }] },
  triggers: [
    { event: 'ui:click', ref: 'tab-shell', do: [{ set: 'tab', value: 'shell' }, { call: 'shellState' }] },
    { event: 'ui:click', ref: 'tab-audit', do: [{ set: 'tab', value: 'audit' }, { call: 'audit' }] },
    { event: 'ui:click', ref: 'tab-timeline', do: [{ set: 'tab', value: 'timeline' }, { call: 'timeline' }] },
    // the accordions: a row click toggles its detail open/closed in place —
    // pure data ($if in the set value, the firing event in scope)
    { event: 'ui:click', ref: 'shell-open', do: [{ set: 'shellOpen', value: { $if: { $eq: ['$.shellOpen', '@event.payload'] }, $then: '', $else: '@event.payload' } }] },
    { event: 'ui:click', ref: 'audit-open', do: [{ set: 'auditOpen', value: { $if: { $eq: ['$.auditOpen', '@event.payload'] }, $then: '', $else: '@event.payload' } }] },
    { event: 'ui:click', ref: 'timeline-open', do: [{ set: 'timelineOpen', value: { $if: { $eq: ['$.timelineOpen', '@event.payload'] }, $then: '', $else: '@event.payload' } }] },
    // inspect (a dock ⚙, an app slotWrapper's chip, or a timeline detail) —
    // PUSH the inspector onto this canvas: devtools navigation is the stack
    { event: 'ui:click', ref: 'inspect', do: [{ set: 'collapsed', value: false }, { push: { action: 'devtools.inspect', input: { instanceId: '@event.payload' } } }] },
    // stack navigation: ← pops the top of that canvas (the shell change
    // re-announces `devtools:state`, which re-reads the tree)
    { event: 'ui:click', ref: 'canvas-back', do: [{ set: 'popCanvas', value: '@event.payload' }, { call: 'pop' }] },
    // ✕ collapses to the ⚙ pill (the dock stays mounted); the pill expands.
    { event: 'ui:click', ref: 'dock-close', do: [{ set: 'collapsed', value: true }] },
    { event: 'ui:click', ref: 'dock-expand', do: [{ set: 'collapsed', value: false }, { call: 'shellState' }] },
    // re-read on the app's telemetry announcements (notify-then-pull): the tree
    // on any shell change, the timeline on any recorded endpoint call.
    { message: 'devtools:state', do: [{ call: 'shellState' }] },
    { message: 'devtools:timeline', do: [{ call: 'timeline' }] },
  ],
};
