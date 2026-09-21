import type { ActionDefinition } from '@niscorp/nova';
import { incidentFeedLayout } from './incident-feed.layout';
import { incidentsOpenPrism } from './live.prism';

// Everything open, newest first. It takes nothing: there is no row to aim it
// at and no hour it depends on, so it has no `input` — no seedable keys, no
// contract (rule 14). Jev either wants it on screen or does not.
export const incidentFeedAction: ActionDefinition = {
  id: 'incident.feed',
  title: 'Incidents',
  description: 'The feed of open incidents, newest first — medical, security, technical, crowd and weather reports, each with where it is; open it when incidents, problems, injuries, faults or what has gone wrong is mentioned.',
  data: { incidents: [], loading: true },
  layout: incidentFeedLayout,
  endpoints: {
    load: { url: '/api/readings/vex', method: 'POST', request: incidentsOpenPrism, target: 'incidents' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
};
