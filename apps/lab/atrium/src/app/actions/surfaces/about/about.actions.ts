import type { ActionDefinition } from '@niscorp/nova';
import { aboutPageLayout, aboutWhoLayout } from './about.layouts';

export const aboutPageAction: ActionDefinition = {
  id: 'about.page',
  data: {
    eyebrow: 'About',
    title: 'Atrium',
    lead: 'A guest-and-staff platform for hotels, built by a third party that integrates property management systems.',
    body: 'One deployment serves two hotels on two different PMS backends and five audiences, from one URL. The application a token produces is not a filtered view of one screen. It is a different set of actions, resolved from what the integration behind that property can actually do.',
  },
  layout: aboutPageLayout,
};

export const aboutWhoAction: ActionDefinition = {
  id: 'about.who',
  data: { name: '' },
  layout: aboutWhoLayout,
};
