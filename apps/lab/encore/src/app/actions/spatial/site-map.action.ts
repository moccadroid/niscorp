import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { siteMapLayout } from './site-map.layout';
import { zonesHeatPrism } from './spatial.prism';
import { zoneRef, dayField, hourField } from '@encore/app/actions/shared/input-fields';

// The site plan, aimed. It answers "where is it?" — so it takes a zone to
// outline and an hour to colour by, and nothing about why anybody is asking.
export const siteMapAction: ActionDefinition = {
  id: 'site.map',
  title: 'Site map',
  description: 'The site map — every zone as a region coloured by how full it is, with one zone outlined; open it when a place, zone, field, gate or crowd movement is mentioned.',
  data: { focusZoneId: '', overlay: 'crowd', day: 'sat', hour: 18, zones: [], loading: true },
  layout: siteMapLayout,
  endpoints: {
    load: { url: '/api/site/vex', method: 'POST', request: zonesHeatPrism, target: 'zones' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
};

export const siteMapInputSchema = z.toJSONSchema(
  z.object({
    focusZoneId: zoneRef.optional(),
    overlay: z.enum(['crowd', 'plain']).optional().describe('What colours the zones: crowd fills them by headcount over capacity; plain draws the plan alone.'),
    day: dayField.optional(),
    hour: hourField.optional(),
  }),
);
