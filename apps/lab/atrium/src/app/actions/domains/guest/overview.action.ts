import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { overviewLayout } from './overview.layout';
import { stayDetailPrism, stayIssuesPrism } from './stay.prism';

// The stay in full, plus anything the guest has already raised. Two independent
// sections, two endpoints, two slots — the detail pattern.
export const stayOverviewAction: ActionDefinition = {
  id: 'stay.overview',
  title: 'Your stay',
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', stay: {}, issues: [], loading: true },
  layout: overviewLayout,
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: stayDetailPrism, target: 'stay' },
    loadIssues: { url: '/api/service/vex', method: 'POST', request: stayIssuesPrism, target: 'issues' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadIssues' }] },
  triggers: [{ message: 'stay-changed', do: [{ call: 'load' }, { call: 'loadIssues' }] }],
};

export const stayOverviewInputSchema = z.toJSONSchema(
  z.object({ capability: z.string().optional().describe('The capability that placed the slot which opened this.'), 
    stayId: z.string().optional().describe('The stay to show.'),
    propertyId: z.string().optional().describe('The property the stay belongs to.'),
    sheetTitle: z.string().optional().describe('Title shown by the sheet fragment.'),
  }),
);
