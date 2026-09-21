import type { LayoutNode } from '@niscorp/nova';

const AUDIENCE_OPTIONS = [
  { value: 'everyone', label: 'Everyone on site' },
  { value: 'arena', label: 'Main arena' },
  { value: 'tent', label: 'The tent' },
  { value: 'campsite', label: 'Campsite' },
  { value: 'vendors', label: 'Vendors' },
  { value: 'crew', label: 'Crew' },
];

const URGENCY_OPTIONS = [
  { value: 0, label: 'Routine' },
  { value: 1, label: 'Important' },
  { value: 2, label: 'Critical' },
];

export const pushComposeLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Push', subtitle: 'draft — nothing is sent until you send it', tone: 'accent' },
  children: [
    {
      component: 'Grid',
      props: { columns: 2, gap: 10 },
      children: [
        {
          component: 'Field',
          props: { label: 'To' },
          children: [{ component: 'Select', ref: 'audience', model: '$.audience', props: { value: '$.audience', options: AUDIENCE_OPTIONS, valueKey: 'value', labelKey: 'label' } }],
        },
        {
          component: 'Field',
          props: { label: 'Urgency' },
          children: [{ component: 'Select', ref: 'urgency', model: '$.urgency', props: { value: '$.urgency', options: URGENCY_OPTIONS, valueKey: 'value', labelKey: 'label', numeric: true } }],
        },
      ],
    },
    {
      component: 'Field',
      props: { label: 'Message' },
      children: [{ component: 'Input', ref: 'body', model: '$.body', props: { value: '$.body', placeholder: 'what they need to know' } }],
    },
    {
      component: 'Row',
      props: { gap: 10, align: 'center' },
      children: [
        { component: 'Button', ref: 'submit', props: { label: 'Send push', variant: 'warn' } },
        { if: '$.saved', then: { component: 'Badge', props: { label: 'sent', tone: 'good' } }, else: '' },
        { if: '$.error', then: { component: 'Text', props: { value: 'That push was refused.', tone: 'alert' } }, else: '' },
      ],
    },
    {
      if: '$.recent.length',
      then: { component: 'List', props: { title: 'Recently sent', rows: '$.recent', rowKey: 'push_id', primaryKey: 'body', secondaryKey: 'audience', metaKey: 'created_by' } },
      else: '',
    },
  ],
};
