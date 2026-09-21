import type { LayoutNode } from '@niscorp/nova';

// The map is rectangles with a number on them. Which key carries the heat is a
// binding — `plain` hands the primitive no heat key at all, so "no overlay" is
// the absence of data rather than a mode the component knows about.
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
