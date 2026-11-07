import type { ActionDefinition } from '@niscorp/nova';
import { guidePackages } from '../../vex/guide.entries';
import { pointsLayout } from './guide.layouts';

export const packagesAction: ActionDefinition = {
  id: 'guide.packages',
  title: 'nisc’s packages',
  description: 'nisc’s packages, each with what it is for: a read of this app’s own table, replayed through vex, each row worded by the read’s Prism mapping.',
  data: {
    title: 'nisc’s packages',
    lead: 'This card is a read: the rows come from the packages table through vex, worded by the read’s mapping.',
    points: [],
    links: [],
  },
  layout: pointsLayout,
  endpoints: { load: { url: '/api/vex', method: 'POST', request: { fingerprint: guidePackages.fingerprint, context: {} }, target: 'points' } },
  lifecycle: { mount: [{ call: 'load' }] },
};
