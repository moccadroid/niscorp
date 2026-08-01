import type { LayoutNode } from '@niscorp/nova';

export const rolloutLayout: LayoutNode = {
  component: 'Box',
  props: { py: 24, px: 20 },
  children: {
    component: 'Stack',
    props: { gap: 22, maxWidth: 1100 },
    children: [
      { component: 'Hero', props: { eyebrow: 'Estate', title: 'Rollout', subtitle: 'One deployment. Different applications, because the integrations differ.' } },
      {
        component: 'Rows',
        props: {
          rows: '$.rows',
          loading: '$.loading',
          rowKey: 'property_id',
          rowRef: 'pick',
          empty: 'No properties.',
          columns: [
            { label: 'Property', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'city' } },
            { label: 'Connector', w: 1, cell: { kind: 'text', key: 'connector_name' } },
            { label: 'Build', w: 'auto', cell: { kind: 'text', key: 'live_version' } },
            { label: 'Resolved', w: 1, cell: { kind: 'text', key: 'synced_display' } },
            { label: '', w: 'auto', cell: { kind: 'action', ref: 'pick', label: 'Inspect', variant: 'quiet' } },
          ],
        },
      },
      {
        if: '$.property.property_id',
        then: {
          component: 'Section',
          props: { title: 'What a guest holds at {{$.property.name}}' },
          children: {
            component: 'Rows',
            props: {
              rows: '$.guestMatrix',
              rowKey: 'slot_id',
              columns: [
                { label: 'Action', w: 2, cell: { kind: 'primary', key: 'title' } },
                { label: 'Needs', w: 1, cell: { kind: 'text', key: 'capability_label' } },
                { label: 'State', w: 1, cell: { kind: 'chip', key: 'reason_text', toneKey: 'reason_tone' } },
              ],
            },
          },
        },
        else: '',
      },
    ],
  },
};
