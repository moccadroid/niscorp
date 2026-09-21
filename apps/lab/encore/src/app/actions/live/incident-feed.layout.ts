import type { LayoutNode } from '@niscorp/nova';

export const incidentFeedLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Open incidents', tone: 'warn' },
  children: [
    { component: 'List', props: { rows: '$.incidents', rowKey: 'incident_id', primaryKey: 'summary', secondaryKey: 'zone_name', metaKey: 'at', badgeKey: 'kind', empty: 'Nothing open.' } },
  ],
};
