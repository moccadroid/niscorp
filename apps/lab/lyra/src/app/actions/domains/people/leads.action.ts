import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { leadSetStatus, leadsList } from '@lyra/app/vex/lead.entries';

// ENQUIRIES, AND WHAT HAPPENED TO THEM.
//
// The question a studio could not answer: how many people asked about us last
// month, where did they come from, and how many joined. Every enquiry lived in
// somebody's inbox and the app only knew about people who had already paid.
//
// Two slices rather than a status filter with five options: "open" is the work
// list and "everyone" is the record. A studio looks at the first one daily and
// the second one when somebody asks where the money went.

const listPrism = {
  fingerprint: leadsList.fingerprint,
  context: { statuses: { $ref: '$.statuses' }, q: { $join: { parts: ['%', { $ref: '$.search' }, '%'], sep: '' } } },
};


const statusPrism = {
  fingerprint: leadSetStatus.fingerprint,
  context: { leadId: { $ref: '$.pendingId' }, status: { $ref: '$.pendingStatus' } },
};

const listLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
      children: [
        { component: 'Hero', props: { title: 'Enquiries', lead: 'People who have asked about the studio and not joined yet.' } },
        { component: 'Button', props: { variant: 'solid', label: 'Record an enquiry' }, ref: 'add' },
        // A filter, not two actions — see `people.layouts.ts` for the argument.
        { component: 'Tabs', props: { value: '$.scope', options: '$.scopes' }, ref: 'scope' },
      ],
    },

    // SEARCH, because this is a screen that lists humans.
    //
    // It had none, and the roll did, which was not a decision — the roll is
    // simply the screen that got the pass. "Did that woman from Tuesday ever
    // come back" is the question this list exists to answer, and three months
    // of enquiries is a scroll.
    { component: 'Input', props: { placeholder: 'Search by name or email' }, ref: 'search', model: '$.search' },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.rows',
          loading: '$.loading',
          rowKey: 'lead_id',
          empty: 'No enquiries yet.',
          emptyHint: 'The next person who asks about prices goes here.',
          columns: [
            { label: 'Person', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'email' } },
            { label: 'Came from', px: 110, cell: { kind: 'text', key: 'source_label', color: 'soft' } },
            { label: 'Asked', px: 110, cell: { kind: 'text', key: 'created_display', color: 'soft' } },
            { label: 'State', px: 110, cell: { kind: 'badge', key: 'status_label', toneKey: 'status_tone' } },
            // THE WHOLE INTERACTION IS ONE TAP PER STEP. An enquiry moves along
            // a short line — they booked a trial, they joined, they went
            // elsewhere — and a form to say so would be three fields nobody
            // fills in. Every one of these is now the SAME write: a status on
            // the row they already have.
            {
              label: '',
              px: 44,
              align: 'right',
              cell: {
                kind: 'menu',
                items: [
                  { label: 'Booked a trial', ref: 'trial', icon: 'clock' },
                  { label: 'They joined', ref: 'convert', icon: 'check' },
                  { label: 'Went elsewhere', ref: 'lost', icon: 'close', danger: true },
                ],
              },
            },
          ],
        },
      },
    },
  ],
};

export const leadsListAction: ActionDefinition = {
  id: 'leads.list',
  title: 'Enquiries',
  data: {
    rows: [],
    loading: true,
    // OPEN means still asking. Everything past it is an outcome the roll owns,
    // because the outcome IS a membership status.
    statuses: ['enquired'],
    scope: 'open',
    scopes: [
      { value: 'open', label: 'Open', statuses: ['enquired'] },
      { value: 'all', label: 'Everyone', statuses: ['enquired', 'trialling', 'active', 'paused', 'lapsed', 'cancelled'] },
    ],
    search: '',
    pendingId: '',
    pendingStatus: '',
    error: '',
  },
  layout: listLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: listPrism, target: 'rows' },
    setStatus: { url: '/api/member/vex', method: 'POST', request: statusPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:click', ref: 'scope', do: [{ set: 'scope', value: '@event.payload.value' }, { set: 'statuses', value: '@event.payload.statuses' }, { call: 'load' }] },

    // Typing IS the interaction — no search button, same as the roll.
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },

    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'leads.form', canvas: 'sheet', with: ['sheet'] } }] },

    // CONVERTING IS ONE WORD CHANGING.
    //
    // "Sign up" used to push the intake form with the enquiry's details as
    // input — and the keys did not match the form's own data keys, so it
    // opened BLANK and the desk retyped from memory into a second person
    // record that never linked back. Three taps, two humans, one dead column.
    //
    // There is no form now because there is nothing to fill in: the person
    // exists, the row exists, and joining is a status. The id lands before the
    // call — the ordering that broke the effect picker once, and the reason it
    // is spelled out every time.
    {
      event: 'ui:click',
      ref: 'trial',
      do: [{ set: 'pendingId', value: '@event.payload.lead_id' }, { set: 'pendingStatus', value: 'trialling' }, { call: 'setStatus', onSuccess: [{ call: 'load' }, { emit: { channel: 'members-changed' } }] }],
    },
    {
      event: 'ui:click',
      ref: 'convert',
      do: [{ set: 'pendingId', value: '@event.payload.lead_id' }, { set: 'pendingStatus', value: 'active' }, { call: 'setStatus', onSuccess: [{ call: 'load' }, { emit: { channel: 'members-changed' } }] }],
    },
    {
      event: 'ui:click',
      ref: 'lost',
      do: [{ set: 'pendingId', value: '@event.payload.lead_id' }, { set: 'pendingStatus', value: 'cancelled' }, { call: 'setStatus', onSuccess: [{ call: 'load' }, { emit: { channel: 'members-changed' } }] }],
    },

    // A WRITER, NOT A LISTENER, on `members-changed`. This used to LISTEN for
    // it and replay whatever `pendingStatus` was still stashed — so abandoning
    // a half-finished conversion and then editing an unrelated member silently
    // marked that enquiry Joined. The roll and this screen are two views of one
    // table now, so each announces its own writes and re-reads on the other's.
    { message: 'members-changed', do: [{ call: 'load' }] },
  ],
};

export const leadsListInputSchema = z.toJSONSchema(z.object({}));

// ── recording one ────────────────────────────────────────────

const formLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    // THE SAME FORM THAT SIGNS SOMEBODY UP, one word apart — so an enquiry is
    // recorded against a real person from the first moment, and joining costs
    // nothing but a status.
    { component: 'Prose', props: { size: 'sm', color: 'mute' }, children: 'Somebody who has asked about the studio. They become a person here straight away, so the day they join is one tap and nothing gets retyped.' },
    { component: 'Input', props: { label: 'Name', placeholder: 'Who asked' }, ref: 'newName', model: '$.newName' },
    { component: 'Input', props: { label: 'Email', type: 'email' }, ref: 'newEmail', model: '$.newEmail' },
    { component: 'Input', props: { label: 'Phone' }, ref: 'newPhone', model: '$.newPhone' },
    {
      component: 'Select',
      props: { label: 'Came from', options: '$.sourceOptions', hint: 'The only reason to record this is to compare them later — and it stays on their record after they join.' },
      ref: 'newSource',
      model: '$.newSource',
    },
    { component: 'Textarea', props: { label: 'Notes', placeholder: 'What they asked about.' }, ref: 'newNotes', model: '$.newNotes' },
    { component: 'Button', props: { variant: 'solid', label: 'Record it' }, ref: 'save' },
  ],
};

export const leadsFormAction: ActionDefinition = {
  id: 'leads.form',
  title: 'Record an enquiry',
  data: {
    // `new*` keys because this posts to the SAME fn the sign-up screen does —
    // `members.create`, which finds the person by email or creates them, then
    // writes one membership. An enquiry differs by `newStatus`.
    newName: '',
    newEmail: '',
    newPhone: '',
    newSource: 'walk-in',
    newNotes: '',
    newStatus: 'enquired',
    error: '',
    sourceOptions: [
      { value: 'walk-in', label: 'Walked in' },
      { value: 'website', label: 'Website' },
      { value: 'referral', label: 'Referral' },
      { value: 'social', label: 'Social' },
      { value: 'event', label: 'Event' },
      { value: 'other', label: 'Other' },
    ],
  },
  layout: formLayout,
  endpoints: { save: { fn: 'members.create', errorTarget: 'error' } },
  triggers: [
    { event: 'ui:model', ref: 'newName', do: [{ set: 'newName', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newEmail', do: [{ set: 'newEmail', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newPhone', do: [{ set: 'newPhone', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newSource', do: [{ set: 'newSource', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newNotes', do: [{ set: 'newNotes', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'save', do: [{ call: 'save', onSuccess: [{ emit: { channel: 'members-changed' } }, { pop: true }] }] },
  ],
};

export const leadsFormInputSchema = z.toJSONSchema(z.object({}));
