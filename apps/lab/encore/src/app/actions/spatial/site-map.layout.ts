import type { LayoutNode } from '@niscorp/nova';

export const siteMapLayout: LayoutNode = {
  component: 'Card',
  props: { title: 'Site', subtitle: '{{$.day}} · {{$.hour}}:00' },
  children: [
    {
      component: 'ZoneMap',
      props: {
        zones: '$.zones',
        idKey: 'zone_id',
        labelKey: 'name',
        heatKey: { $if: { $eq: ['$.overlay', 'crowd'] }, $then: 'heat', $else: '' },
        focus: '$.focusZoneId',
        width: 100,
        height: 60,
      },
    },
  ],
};
