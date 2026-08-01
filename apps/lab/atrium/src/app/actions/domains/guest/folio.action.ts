import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { folioLayout } from './folio.layout';
import { folioPrism, folioTotalPrism } from './stay.prism';
import { previewable, previewTriggers } from '@atrium/app/actions/preview';

// The bill. Two independent reads — the lines and the total — because they are
// two questions and the total is an aggregate, not a sum computed on screen.
//
// Preview-capable: collapsed on the home it is one box whose live line IS the
// running total — the number no launcher tile could ever show.
export const stayFolioAction: ActionDefinition = {
  id: 'stay.folio',
  title: 'Your bill',
  data: { stayId: '', propertyId: '', capability: '', sheetTitle: '', expanded: true, lines: [], total: {}, loading: true },
  layout: previewable(
    { component: 'Tile', ref: 'expand', props: { title: 'Your bill', blurb: '{{$.total.total_display}} so far — tap for the lines', icon: 'receipt' } },
    folioLayout,
  ),
  endpoints: {
    load: { url: '/api/stay/vex', method: 'POST', request: folioPrism, target: 'lines' },
    loadTotal: { url: '/api/stay/vex', method: 'POST', request: folioTotalPrism, target: 'total' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'loadTotal' }] },
  triggers: [{ message: 'folio-changed', do: [{ call: 'load' }, { call: 'loadTotal' }] }, ...previewTriggers],
};

export const stayFolioInputSchema = z.toJSONSchema(
  z.object({
    capability: z.string().optional().describe('The capability that placed the slot which opened this.'),
    stayId: z.string().optional(),
    propertyId: z.string().optional(),
    sheetTitle: z.string().optional(),
    expanded: z.boolean().optional().describe('false renders the one-line preview (the home list); true (default) the full bill.'),
  }),
);
