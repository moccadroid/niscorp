import type { LayoutNode } from '@niscorp/nova';

// The issue family's four faces. Each is ONE shape with no branch at its root —
// that rule is what killed the old board's nested collapsed/expanded and
// open/not-open conditions. A branch inside a layout is fine (an absent detail
// line, an empty task list); a branch at the ROOT means two surfaces wearing one
// id.

// ── tile ────────────────────────────────────────────────────
export const issueTileLayout: LayoutNode = {
  component: 'Tile',
  ref: 'open',
  props: {
    title: 'Issues',
    icon: 'flag',
    blurb: { $if: '$.count.count', $then: '{{$.count.count}} on the board — tap to work them', $else: 'Nothing open. Rare and good.' },
  },
};

// ── list ────────────────────────────────────────────────────
export const issueListLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    {
      component: 'Row',
      props: { gap: 10, align: 'center', wrap: true },
      children: [
        {
          component: 'Tabs',
          ref: 'tab',
          props: {
            value: '$.scope',
            options: [
              { value: 'open', label: 'Open' },
              { value: 'resolved', label: 'Resolved' },
              { value: 'all', label: 'All' },
            ],
          },
        },
        { component: 'Box', props: { width: 220 }, children: { component: 'Input', ref: 'search', model: '$.search', props: { placeholder: 'Search…', icon: 'search', debounce: 200 } } },
      ],
    },
    {
      component: 'Rows',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'issue_id',
        rowRef: 'row',
        empty: 'Nothing open. Rare and good.',
        columns: [
          { label: 'Reported', w: 3, cell: { kind: 'primary', key: 'summary', subKey: 'detail' } },
          { label: 'Room', w: 'auto', cell: { kind: 'text', key: 'room_number' } },
          { label: 'Severity', w: 'auto', cell: { kind: 'chip', key: 'severity', toneKey: 'severity_tone' } },
          { label: 'Status', w: 'auto', cell: { kind: 'chip', key: 'status', toneKey: 'status_tone' } },
          { label: 'Raised', w: 1, cell: { kind: 'text', key: 'raised_display' } },
        ],
      },
    },
  ],
};

// ── detail ──────────────────────────────────────────────────
const issueDetailBody: LayoutNode = {
  component: 'Stack',
  props: { gap: 15 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'start', gap: 10 },
      children: [
        {
          component: 'Stack',
          props: { gap: 3 },
          children: [
            { component: 'Text', props: { serif: true, size: 'lg' }, children: '$.issue.summary' },
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Room {{$.issue.room_number}} · raised by {{$.issue.raised_by}} · {{$.issue.raised_display}}' },
          ],
        },
        { component: 'Button', ref: 'close', props: { variant: 'plain', icon: 'close', label: 'Close this issue' }, children: 'Close' },
      ],
    },
    {
      component: 'Row',
      props: { gap: 8 },
      children: [
        { component: 'Badge', props: { tone: '$.issue.status_tone' }, children: '$.issue.status' },
        { component: 'Badge', props: { tone: '$.issue.severity_tone' }, children: '$.issue.severity' },
      ],
    },
    { if: '$.issue.detail', then: { component: 'Card', props: { sunk: true }, children: { component: 'Text', props: { size: 'sm', italic: true }, children: '“{{$.issue.detail}}”' } }, else: '' },
    {
      if: '$.tasks.length',
      then: {
        component: 'Section',
        props: { title: 'On the floor' },
        children: {
          component: 'Rows',
          props: {
            rows: '$.tasks',
            rowKey: 'task_id',
            dense: true,
            columns: [
              { w: 3, cell: { kind: 'primary', key: 'title' } },
              { w: 'auto', cell: { kind: 'chip', key: 'status', toneKey: 'status_tone' } },
            ],
          },
        },
      },
      else: '',
    },
    { component: 'Rule', props: {} },
    // ONE STATE. The controls that send this to somebody are always on the
    // record, because there is no reading of an open fault where they are not
    // the next thing. A first state whose only content was a button revealing
    // the second cost a click, made `dispatching` a thing the assistant had to
    // know to set, and showed the user less than the surface already knew.
    {
      component: 'Stack',
      props: { gap: 12 },
      children: [
        {
          component: 'Tabs',
          ref: 'kind',
          props: {
            value: '$.kind',
            options: [
              { value: 'maintenance', label: 'Maintenance' },
              { value: 'housekeeping', label: 'Housekeeping' },
            ],
          },
        },
        {
          component: 'Row',
          props: { gap: 6, wrap: true },
          children: {
            for: '$.staff',
            as: 'p',
            key: 'staff_id',
            do: {
              component: 'Button',
              ref: 'assignee',
              props: { variant: { $if: { $eq: ['$p.staff_id', '$.assigneeId'] }, $then: 'solid', $else: 'quiet' }, value: '$p.staff_id' },
              children: '$p.name',
            },
          },
        },
        {
          component: 'Row',
          props: { gap: 10, justify: 'end' },
          children: [
            { component: 'Button', ref: 'resolve', props: { variant: 'plain', icon: 'check' }, children: 'Mark resolved' },
            { component: 'Button', ref: 'send', props: { icon: 'wrench', disabled: '$.working' }, children: 'Dispatch' },
          ],
        },
      ],
    },
  ],
};

// The record sits ON a card, like the queue beside it. It came out of the
// monolith without one — the card used to come from the collapsible frame — and
// a record on the bare page ground next to a carded list reads as unfinished.
export const issueDetailLayout: LayoutNode = {
  component: 'Box',
  props: { maxWidth: 720 },
  children: { component: 'Card', props: {}, children: issueDetailBody },
};
