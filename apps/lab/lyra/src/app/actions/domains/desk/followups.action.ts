import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { closeFollowUp, followUpsOpen, notificationsMarkSeen } from '@lyra/app/vex/tide.entries';

const listPrism = { fingerprint: followUpsOpen.fingerprint, context: {} };
const donePrism = {
  fingerprint: closeFollowUp.fingerprint,
  context: { followUpId: { $ref: '$.pendingId' }, done: { $ref: '$.pendingDone' } },
};
// The ids come off the list on screen — see the entry for why that is the
// honest bound, not a shortcut.
const seenPrism = {
  fingerprint: notificationsMarkSeen.fingerprint,
  context: { ids: { $map: { over: { $ref: '$.rows' }, as: 'r', body: { $get: { from: { $var: 'r' }, path: ['follow_up_id'] } } } } },
};

const layout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Hero',
      props: {
        title: 'Notices',
        lead: 'Things an installed add-on has told the studio. Lyra’s own automations do not write here — anything Lyra can answer with a query is a screen, not a list.',
      },
    },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.rows',
          loading: '$.loading',
          rowKey: 'follow_up_id',
          empty: 'Nothing to read.',
          emptyHint: 'An add-on that has something to tell you — a belt awarded, a payment failed — puts it here.',
          emptyIcon: 'check',
          columns: [
            // The JOB is the identity of the row and the detail is a sentence,
            // so it goes through a wrapping cell rather than a truncating one.
            { label: 'What happened', w: 2, cell: { kind: 'primary', key: 'title', subKey: 'person_name' } },
            { label: 'Due', px: 104, cell: { kind: 'badge', key: 'due_display', toneKey: 'due_tone' } },
            {
              label: '',
              px: 44,
              align: 'right',
              cell: { kind: 'menu', items: [{ label: 'Clear it', ref: 'done', icon: 'check' }] },
            },
          ],
        },
      },
    },

    {
      component: 'Sheet',
      props: { open: '$.confirmOpen', title: 'Clear it?' },
      ref: 'cancel',
      children: {
        component: 'Stack',
        props: { gap: 14 },
        children: [
          { component: 'Prose', props: { color: 'soft' }, children: '$.confirmText' },
          { component: 'Button', props: { variant: 'solid', big: true, label: 'Yes, clear it' }, ref: 'confirm' },
          { component: 'Button', props: { variant: 'ghost', big: true, label: 'Not yet' }, ref: 'cancel' },
        ],
      },
    },
  ],
};

export const followUpsAction: ActionDefinition = {
  id: 'desk.followups',
  title: 'Notices',
  data: { rows: [], loading: true, pendingId: '', pendingDone: true, confirmOpen: false, confirmText: '', error: '' },
  layout,
  endpoints: {
    load: { url: '/api/automation/vex', method: 'POST', request: listPrism, target: 'rows' },
    setDone: { url: '/api/automation/vex', method: 'POST', request: donePrism, errorTarget: 'error' },
    // Opening this list IS the studio reading its inbox: the flag flips for
    // every unread row, the trigger stamps when, and the chrome's bell hears
    // the announcement and re-counts to zero.
    markSeen: { url: '/api/automation/vex', method: 'POST', request: seenPrism, errorTarget: 'error' },
  },
  lifecycle: {
    // Marking seen rides load's success because its ids ARE the loaded rows.
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }, { call: 'markSeen', onSuccess: [{ emit: { channel: 'notices-seen' } }] }] },
    ],
    // Coming back to it: an automation may have run, or somebody else may have
    // worked through half of them.
    resume: [{ call: 'load', onSuccess: [{ call: 'markSeen', onSuccess: [{ emit: { channel: 'notices-seen' } }] }] }],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'done',
      do: [
        { set: 'pendingId', value: '@event.payload.follow_up_id' },
        { set: 'confirmText', value: '@event.payload.title' },
        { set: 'confirmOpen', value: true },
      ],
    },
    { event: 'ui:click', ref: 'cancel', do: [{ set: 'confirmOpen', value: false }] },
    {
      event: 'ui:click',
      ref: 'confirm',
      do: [
        { set: 'pendingDone', value: true },
        { set: 'confirmOpen', value: false },
        { call: 'setDone', onSuccess: [{ call: 'load' }] },
      ],
    },
  ],
};

export const followUpsInputSchema = z.toJSONSchema(z.object({}));
