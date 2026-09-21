import type { LayoutNode } from '@niscorp/nova';

// Five lists under one heading. `max` keeps each to what fits a glance — the
// full feed and the full running order are their own cards.
export const situationNowLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Right now', subtitle: '{{$.day}} · {{$.hour}}:00' },
  children: [
    { component: 'List', props: { title: 'On stage and next', rows: '$.onStage', rowKey: 'slot_id', primaryKey: 'act_name', secondaryKey: 'stage_name', metaKey: 'starts_at', max: 6, empty: 'Nobody on, nobody due.' } },
    { component: 'List', props: { title: 'Weather, next three hours', rows: '$.warnings', rowKey: 'hour', primaryKey: 'condition', secondaryKey: 'wind_kph', secondaryPrefix: 'wind ', secondarySuffix: ' kph', metaKey: 'hour', metaSuffix: ':00', tone: 'warn', empty: 'Nothing worse than fair.' } },
    { component: 'List', props: { title: 'Open incidents', rows: '$.incidents', rowKey: 'incident_id', primaryKey: 'summary', secondaryKey: 'zone_name', metaKey: 'at', max: 4, empty: 'None open.' } },
    { component: 'List', props: { title: 'Holds called', rows: '$.holds', rowKey: 'delay_id', primaryKey: 'act_name', secondaryKey: 'minutes', secondarySuffix: ' min', metaKey: 'created_by', max: 4, empty: 'No holds called.' } },
    { component: 'List', props: { title: 'Fullest zones', rows: '$.zones', rowKey: 'zone_id', primaryKey: 'name', secondaryKey: 'fill_display', metaKey: 'headcount', max: 3, empty: 'No counts for that hour.' } },
  ],
};
