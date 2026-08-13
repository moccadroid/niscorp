import type { ActionDefinition } from '@niscorp/nova';
import { studioCurrent, studioSetDomain, studioSetReplyTo } from '@lyra/app/vex/studio.entries';

// ═══════════════════════════════════════════════════════════════
// MAIL — the one thing a studio has to tell us about sending.
//
// Every studio sends from one shared, verified deployment domain wearing its
// OWN name: `Lumen Yoga <lumen@mail.lyra.app>`. That is what makes a studio
// able to send correctly the moment it is created, with nothing configured.
//
// The one thing it cannot derive is where a REPLY should go. Without it a
// member's answer lands at an address nobody reads — so this screen exists to
// ask, and the sentence about replies lives here, beside the field that makes
// it true, rather than in copy every studio reads whether or not it applies.
//
// Bring-your-own-domain lands on this screen too: enter a domain, publish two
// DNS records, verify, and the sender changes. Nothing else moves.
// ═══════════════════════════════════════════════════════════════

export const studioMailLayout = {
  component: 'Stack',
  props: { gap: 20, maxWidth: 640 },
  children: [
    {
      component: 'Section',
      props: {
        title: 'Mail',
        subtitle: 'Your studio’s name is on everything the automations send. This is where an answer comes back to.',
      },
    },
    {
      component: 'Card',
      children: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          // WHAT A MEMBER ACTUALLY SEES IN THEIR INBOX, composed from the same
          // two parts the transport composes the real envelope from: the
          // studio's name and its slug. A studio reading its own sender can
          // tell at a glance whether this is set up.
          { component: 'Field', props: { label: 'Messages are sent as', icon: 'mail', value: '$.sentAs' } },
          {
            component: 'Input',
            props: {
              label: 'Replies go to',
              type: 'email',
              placeholder: 'hallo@yourstudio.at',
              hint: 'Your own address. A member who answers one of these emails reaches you, not us — leave it blank and their reply goes nowhere.',
            },
            ref: 'replyTo',
            model: '$.replyTo',
          },
          { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
          { if: '$.saved', then: { component: 'Notice', props: { tone: 'good', message: 'Saved.' } }, else: '' },
          {
            component: 'Input',
            props: {
              label: 'Most messages in a day',
              type: 'number',
              hint: 'A ceiling, not a target. It is here so one mistake — a bad import, an automation pointed at everybody — cannot run away overnight.',
            },
            ref: 'dailyCap',
            model: '$.dailyCap',
          },
          {
            component: 'Row',
            props: { gap: 10 },
            children: [{ component: 'Button', props: { variant: 'solid', label: 'Save', disabled: '$.saving' }, ref: 'save' }],
          },
        ],
      },
    },
    {
      component: 'Section',
      props: {
        title: 'Your own domain',
        subtitle: 'Optional. Members see your address instead of ours, and your sending reputation stops being shared with anybody.',
      },
    },
    {
      component: 'Card',
      children: {
        component: 'Stack',
        props: { gap: 16 },
        children: [
          {
            if: '$.domainOk',
            then: { component: 'Notice', props: { tone: 'good', message: 'Verified — your mail goes out from your own domain.' } },
            else: {
              if: '$.domainId',
              // THE WAIT IS THE FEATURE. DNS is somebody else's system and it
              // takes as long as it takes, so the screen shows exactly what to
              // publish and asks again when told to, rather than pretending a
              // spinner is progress.
              then: {
                component: 'Stack',
                props: { gap: 12 },
                children: [
                  { component: 'Notice', props: { tone: 'warn', message: '$.domainStatus' } },
                  {
                    component: 'Rows',
                    props: {
                      rows: '$.records',
                      rowKey: 'name',
                      empty: 'Nothing to publish.',
                      columns: [
                        { label: 'Type', px: 90, cell: { kind: 'text', key: 'type' } },
                        { label: 'Name', w: 2, cell: { kind: 'text', key: 'name' } },
                        { label: 'Value', w: 3, cell: { kind: 'text', key: 'value' } },
                      ],
                    },
                  },
                  {
                    component: 'Row',
                    props: { gap: 10 },
                    children: [{ component: 'Button', props: { variant: 'solid', label: 'Check again', disabled: '$.checking' }, ref: 'check' }],
                  },
                ],
              },
              else: {
                component: 'Stack',
                props: { gap: 12 },
                children: [
                  {
                    component: 'Input',
                    props: { label: 'Domain', placeholder: 'mail.yourstudio.at', hint: 'A subdomain you own. We will show you the records to publish.' },
                    ref: 'domain',
                    model: '$.domain',
                  },
                  {
                    component: 'Row',
                    props: { gap: 10 },
                    children: [{ component: 'Button', props: { variant: 'ghost', label: 'Add domain', disabled: '$.adding' }, ref: 'add' }],
                  },
                ],
              },
            },
          },
          { if: '$.domainError', then: { component: 'Notice', props: { tone: 'alert', message: '$.domainError' } }, else: '' },
        ],
      },
    },
  ],
};

export const studioMailAction: ActionDefinition = {
  id: 'studio.mail',
  title: 'Mail',
  data: { studioId: '', studioRow: {}, sentAs: '', replyTo: '', dailyCap: 1000, saving: false, saved: false, error: '', domain: '', domainId: '', domainOk: false, domainStatus: '', domainError: '', records: [], added: {}, checked: {}, adding: false, checking: false },
  layout: studioMailLayout,
  endpoints: {
    self: { url: '/api/studio/vex', method: 'POST', request: { fingerprint: studioCurrent.fingerprint, context: {} }, target: 'studioRow' },
    sender: { fn: 'mail.sender', target: 'sentAs' },
    save: {
      url: '/api/studio/vex',
      method: 'POST',
      request: { fingerprint: studioSetReplyTo.fingerprint, context: { studioId: { $ref: '$.studioId' }, replyTo: { $ref: '$.replyTo' }, dailyCap: { $ref: '$.dailyCap' } } },
      errorTarget: 'error',
    },
    // The provider is ASKED by a function; what it says is WRITTEN DOWN by a
    // mutation. Two endpoints because they are two different kinds of act, and
    // because a function that both called a vendor and wrote a row would be
    // the one place in this app where tenancy is enforced by a comment.
    addDomain: { fn: 'mail.addDomain', target: 'added', errorTarget: 'domainError' },
    checkDomain: { fn: 'mail.checkDomain', target: 'checked', errorTarget: 'domainError' },
    recordDomain: {
      url: '/api/studio/vex',
      method: 'POST',
      request: {
        fingerprint: studioSetDomain.fingerprint,
        context: { studioId: { $ref: '$.studioId' }, domain: { $ref: '$.domain' }, domainId: { $ref: '$.domainId' }, verified: { $ref: '$.domainOk' } },
      },
      errorTarget: 'domainError',
    },
  },
  // A LIFECYCLE MOUNT, not a `ui:` trigger — the screen has to know the studio
  // before anybody touches it.
  lifecycle: {
    mount: [
      {
        call: 'self',
        onSuccess: [
          { set: 'studioId', value: '$.studioRow.studio_id' },
          { set: 'replyTo', value: '$.studioRow.reply_to' },
          { set: 'dailyCap', value: '$.studioRow.daily_mail_cap' },
          { set: 'domain', value: '$.studioRow.sending_domain' },
          { set: 'domainId', value: '$.studioRow.sending_domain_id' },
          { set: 'domainOk', value: '$.studioRow.sending_domain_ok' },
        ],
      },
      { call: 'sender' },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'add',
      do: [
        { set: 'domainError', value: '' },
        { set: 'adding', value: true },
        {
          call: 'addDomain',
          onSuccess: [
            { set: 'adding', value: false },
            { set: 'domainId', value: '$.added.domainId' },
            { set: 'records', value: '$.added.records' },
            { set: 'domainStatus', value: 'Publish these records with whoever runs your DNS, then press Check again. It can take minutes or hours — that part is not ours.' },
            // Written down BEFORE it verifies, so the records survive a reload:
            // somebody who closes this screen while waiting for DNS has not
            // lost the domain they registered.
            { call: 'recordDomain' },
          ],
          onError: [{ set: 'adding', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'check',
      do: [
        { set: 'domainError', value: '' },
        { set: 'checking', value: true },
        {
          call: 'checkDomain',
          onSuccess: [
            { set: 'checking', value: false },
            { set: 'domainOk', value: '$.checked.verified' },
            { set: 'domainStatus', value: 'Not verified yet. DNS takes a while to travel — press Check again in a few minutes.' },
            { call: 'recordDomain' },
          ],
          onError: [{ set: 'checking', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'error', value: '' },
        { set: 'saved', value: false },
        { set: 'saving', value: true },
        {
          call: 'save',
          onSuccess: [
            { set: 'saving', value: false },
            { set: 'saved', value: true },
          ],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
  ],
};
