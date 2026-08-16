import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { campaignsList } from '@lyra/app/vex/campaign.entries';

// WHAT THE STUDIO HAS SAID, AND TO WHOM — the screen an owner opens twice a
// week. One row per campaign, carrying the QUESTION it asked rather than a
// list of names: "Gone quiet" is what somebody needs to read to know what they
// did, and the phrase comes from the audience's own row so it goes through the
// phrasebook like every other sentence here.
const campaignsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
      children: [
        { component: 'Hero', props: { title: 'Campaigns', lead: 'What you have written to your people, and what became of it.' } },
        { component: 'Button', props: { variant: 'solid', label: 'Write to your people' }, ref: 'compose' },
      ],
    },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.campaigns',
          loading: '$.loading',
          rowKey: 'campaign_id',
          empty: 'Nothing has gone out yet.',
          emptyHint: 'Pick a question, type three sentences, send.',
          columns: [
            { label: 'Subject', w: 2, cell: { kind: 'primary', key: 'subject', subKey: 'audience_display' } },
            { label: 'Went to', px: 100, align: 'right', cell: { kind: 'text', key: 'queued_count' } },
            { label: 'Sent', px: 120, cell: { kind: 'text', key: 'sent_display', color: 'soft' } },
            { label: 'State', px: 110, cell: { kind: 'text', key: 'state_display' } },
          ],
        },
      },
    },

    // WHY A REFUSAL IS ON THIS SCREEN. A campaign the day's ceiling would not
    // hold queues NOTHING rather than going half out, and a studio that cannot
    // read why has a mystery instead of a number.
    {
      if: '$.refusals',
      then: { component: 'Notice', props: { tone: 'warn', message: 'Some of these did not go out.', detail: '$.refusals' } },
      else: '',
    },
  ],
};

export const campaignsAction: ActionDefinition = {
  id: 'campaigns.list',
  title: 'Campaigns',
  data: { campaigns: [], refusals: '', loading: true, error: '' },
  layout: campaignsLayout,
  endpoints: {
    load: {
      url: '/api/campaigns/vex',
      method: 'POST',
      request: { fingerprint: campaignsList.fingerprint, context: {} },
      target: 'campaigns',
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }, { emit: { channel: 'read-refusals' } }] }] },
  triggers: [
    // ONTO THE PAGE STACK, not over it. Composing is the task, not a detail
    // about this list, and it wants the width a desk has — see the compose
    // screen's own note. Its Cancel pops back to here.
    {
      event: 'ui:click',
      ref: 'compose',
      do: [{ push: { action: 'campaigns.compose', canvas: 'main' } }],
    },
    // The list reloads when a campaign is written; the messages it becomes are
    // the fan-out's business and land on the outbox.
    { message: 'campaigns-changed', do: [{ call: 'load', onSuccess: [{ emit: { channel: 'read-refusals' } }] }] },
    {
      message: 'read-refusals',
      do: [
        {
          set: 'refusals',
          value: {
            $prism: {
              $join: {
                parts: {
                  $map: {
                    over: { $filter: { over: { $ref: '$.campaigns' }, as: 'c', when: { $eq: [{ $get: { from: { $var: 'c' }, path: ['state'] } }, 'refused'] } } },
                    as: 'c',
                    body: { $get: { from: { $var: 'c' }, path: ['refused_reason'] } },
                  },
                },
                sep: ' · ',
              },
            },
          },
        },
      ],
    },
  ],
};

export const campaignsInputSchema = z.toJSONSchema(z.object({}));
