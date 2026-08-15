import type { ActionDefinition } from '@niscorp/nova';

// STRIPE'S BUNDLE — actions and layouts, composed from lyra's vocabulary.
//
// This file may not import anything from lyra. Not a component name, not a
// fingerprint constant: the contract arrives over the wire
// (`GET /api/integrations/contract`) and separation-check asserts the absence.
//
// Everything here is ordinary nova. The `Frame` seam and the `embed/onboarding`
// page it declares (below) are still built and still declared — the embedded
// Connect components are the intended path — but the setup screen uses HOSTED
// onboarding today, because the embed needs platform-side Connect config that is
// not yet in place and renders blank without it. The declared frame stays so the
// embed lights up the day that config lands, with no bundle change.

const OWN = '/integrations/stripe';

const heading = (title: string, lead: string) => ({ component: 'Hero', props: { title, lead } });

// ── SETUP: the owner connects the studio ─────────────────────
//
// Three states, none branching on capability: no account yet (one button makes
// one), connected but incomplete (a link to Stripe's hosted onboarding), or
// ready.
//
// HOSTED ONBOARDING, not the embedded frame. The embed needs the platform's
// Connect embedded-components profile configured before Stripe will render it,
// which is not done — so it returns an `api_error` and a blank box, and the
// owner cannot enter anything. A hosted Account Link works today with no
// platform setup, so that is the owner's real path in. The redirect is off
// lyra, which S1 held at arm's length; a working redirect beats an embed nobody
// can fill, and the embed returns the day the platform profile is set up.
const setupAction: ActionDefinition = {
  id: 'ext.desk.stripe.setup',
  title: 'Stripe',
  data: { account: {}, onboarding: {}, error: '', loading: true, starting: false },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('Stripe', 'Take card and SEPA payments for memberships through Stripe. The studio is the merchant; money goes to the studio’s own account.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },

      {
        // LOADING FIRST, so the screen does not flash "Not connected" while it is
        // still asking. The account read decides everything below it, and until
        // it answers, "connected?" is unknown, not "no".
        if: '$.loading',
        then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Checking this studio’s payment status…' },
        else: {
          if: '$.account.account_id',
          // CONNECTED. `$.account.state` is 'ready' | 'needs_info' | 'in_review',
          // set by the pack from what Stripe actually reports.
          then: {
            component: 'Stack',
            props: { gap: 16 },
            children: [
              {
                component: 'Row',
                props: { gap: 12, align: 'center', wrap: true },
                children: [
                  { component: 'Badge', props: { label: '$.account.state_label', tone: '$.account.state_tone' } },
                  { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.account.detail' },
                ],
              },

              // NEEDS INFO: the studio has something to fill. Only here is a
              // button offered, because only here is there a step for them.
              {
                if: '$.account.actionable',
                then: {
                  component: 'Stack',
                  props: { gap: 10 },
                  children: [
                    // MANAGING EXPECTATIONS, because Stripe's flow does not. It is
                    // single-use and multi-step: it collects some details, sends
                    // the owner back, and the next click collects the next set.
                    // Test accounts especially bounce. Saying so up front is the
                    // difference between "this is broken" and "this is how it goes".
                    {
                      component: 'Notice',
                      props: {
                        tone: 'calm',
                        message: 'Setting up with Stripe can take a few passes: it asks for some details, brings you back here, and the next tap asks for the next set. Keep going until this says Ready — you can stop and come back any time.',
                      },
                    },
                    {
                      if: '$.onboarding.url',
                      then: { component: 'Button', props: { variant: 'solid', big: true, label: 'Continue on Stripe', href: '$.onboarding.url' }, ref: 'go' },
                      else: { component: 'Button', props: { variant: 'solid', big: true, label: 'Enter business details', disabled: '$.starting' }, ref: 'onboard' },
                    },
                  ],
                },
                else: {
                  if: '$.account.ready',
                  // READY: it works, and a link to Stripe stays — the studio owns
                  // its account and may want to change bank details or add
                  // information later. Managing runs on Stripe's own pages, so
                  // this is the same hosted flow, reached deliberately rather than
                  // because anything is wrong.
                  then: {
                    component: 'Row',
                    props: { gap: 10, wrap: true },
                    children: [
                      {
                        if: '$.onboarding.url',
                        then: { component: 'Button', props: { variant: 'outline', label: 'Manage on Stripe', href: '$.onboarding.url' }, ref: 'go' },
                        else: { component: 'Button', props: { variant: 'outline', label: 'Manage on Stripe', disabled: '$.starting' }, ref: 'onboard' },
                      },
                    ],
                  },
                  // IN REVIEW: nothing for the owner to do but wait. No Stripe
                  // link — clicking one is what sent them in circles. A Refresh
                  // re-reads Stripe, because the review finishing is the one thing
                  // that changes without them acting.
                  else: {
                    component: 'Row',
                    props: { gap: 10 },
                    children: [{ component: 'Button', props: { variant: 'ghost', label: 'Refresh', disabled: '$.loading' }, ref: 'recheck' }],
                  },
                },
              },
            ],
          },
          // NOT CONNECTED: one button. Everything Stripe needs to know about the
          // studio, this pack already knows from the assertion.
          else: {
            component: 'Stack',
            props: { gap: 14 },
            children: [
              {
                component: 'Empty',
                props: {
                  title: 'Not connected yet',
                  hint: 'Connecting creates this studio’s own Stripe account. Stripe will ask for the business details it needs before any money can move.',
                },
              },
              {
                component: 'Row',
                props: { gap: 10 },
                children: [{ component: 'Button', props: { variant: 'solid', big: true, label: 'Connect this studio', disabled: '$.loading' }, ref: 'connect' }],
              },
            ],
          },
        },
      },
    ],
  },
  endpoints: {
    // errorTarget, because this read gates the only control on the screen.
    // Without it a failure was invisible: `loading` never cleared, the button
    // stayed greyed out forever, and the screen said "Not connected yet" as
    // though that were the whole story.
    account: { url: `${OWN}/account`, method: 'POST', request: {}, target: 'account', errorTarget: 'error' },
    connect: { url: `${OWN}/connect`, method: 'POST', request: {}, target: 'account', errorTarget: 'error' },
    // Mints a hosted-onboarding link for THIS studio's account, returning to
    // lyra when the owner is done. The return address is the host's — the pack
    // does not let a caller choose where a payment flow lands.
    onboard: { url: `${OWN}/onboarding-link`, method: 'POST', request: {}, target: 'onboarding', errorTarget: 'error' },
  },
  lifecycle: {
    // LOADING CLEARS EITHER WAY. It gates the Connect button, so tying it to
    // success alone means any failure — the pack unreachable, the studio not
    // installed, a network blip — hands somebody a dead control and no reason.
    // A screen that cannot read its state should still let you act on it.
    mount: [
      {
        call: 'account',
        onSuccess: [{ set: 'loading', value: false }],
        onError: [{ set: 'loading', value: false }],
      },
    ],
    // Coming back from Stripe's hosted onboarding: re-read the account, because
    // its capability state is exactly what just changed — and DROP the used
    // link, which is single-use, so the button offers a fresh one rather than a
    // dead one.
    resume: [
      { set: 'onboarding', value: {} },
      { set: 'loading', value: true },
      { call: 'account', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'connect',
      do: [
        { set: 'error', value: '' },
        { set: 'loading', value: true },
        { call: 'connect', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'onboard',
      do: [
        { set: 'error', value: '' },
        { set: 'starting', value: true },
        { call: 'onboard', onSuccess: [{ set: 'starting', value: false }], onError: [{ set: 'starting', value: false }] },
      ],
    },
    {
      // REFRESH: the honest answer to "is Stripe done reviewing yet?", which is a
      // question only Stripe can answer and only over time. Re-reads the account
      // and drops any stale single-use link.
      event: 'ui:click',
      ref: 'recheck',
      do: [
        { set: 'error', value: '' },
        { set: 'onboarding', value: {} },
        { set: 'loading', value: true },
        { call: 'account', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] },
      ],
    },
  ],
};

// ── THE MONEY HUB'S OWN SCREEN ───────────────────────────────
//
// Placed under `hub.money`, which lyra had to offer before this bundle could
// name it — intake refuses a placement into a hub the host does not advertise.
//
// The ledger itself (invoices, refunds, disputes) is NOT here yet. Stripe
// compels three embedded components and this is not one of them, so it is ours
// to build from the pack's own mirror — S4 — and it arrives with the hook
// handlers that fill that mirror.
const ledgerAction: ActionDefinition = {
  id: 'ext.desk.stripe.ledger',
  title: 'Money',
  data: { account: {}, invoices: [], loading: true, error: '' },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('Money', 'What has been charged, refunded and disputed at this studio.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        if: '$.account.account_id',
        // THE PACK'S OWN MIRROR, not a call to Stripe on every page load (S4).
        // Lyra holds standing and never learns an invoice; this side holds the
        // invoices and never learns a member's name. Anything here disagreeing
        // with Stripe is this table being stale, and the fix is a redelivery.
        then: {
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.invoices',
              loading: '$.loading',
              rowKey: 'invoice_id',
              empty: 'Nothing charged yet. Invoices appear here as members pay.',
              columns: [
                { label: 'Date', px: 130, cell: { kind: 'text', key: 'date_display', color: 'soft' } },
                { label: 'Amount', px: 120, cell: { kind: 'primary', key: 'amount_display' } },
                { label: 'State', px: 130, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
                { label: '', w: 1, cell: { kind: 'text', key: 'note', color: 'soft' } },
              ],
            },
          },
        },
        else: {
          component: 'Empty',
          props: { title: 'Payments are not connected', hint: 'An owner can connect this studio from the Payments settings.' },
        },
      },
    ],
  },
  endpoints: {
    account: { url: `${OWN}/account`, method: 'POST', request: {}, target: 'account' },
    invoices: { url: `${OWN}/ledger`, method: 'POST', request: {}, target: 'invoices', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'account' }, { call: 'invoices', onSuccess: [{ set: 'loading', value: false }] }] },
};

// ── THE MEMBER'S OWN SIDE ────────────────────────────────────
//
// Ordinary nova, no frame. Stripe Checkout is a hosted page a member is SENT to,
// and that is fine: S1's "studios never visit stripe.com" is about the merchant,
// not about somebody paying. A member on Stripe's own payment page is the normal
// shape, and the one their bank's 3-D Secure step expects.
const payAction: ActionDefinition = {
  id: 'ext.member.stripe.pay',
  title: 'Payment',
  data: { checkout: {}, error: '', starting: false },
  layout: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      heading('Payment', 'Set up your membership payment. You will be taken to a secure page to enter your card or bank details.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        if: '$.checkout.url',
        // The URL is NOT followed automatically. A redirect that happens without
        // a click is indistinguishable from a hijack, and this is the screen
        // where somebody is about to type a card number.
        then: {
          component: 'Stack',
          props: { gap: 10 },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ready for {{$.checkout.plan_name}}.' },
            { component: 'Button', props: { variant: 'solid', big: true, label: 'Continue to payment', href: '$.checkout.url' }, ref: 'go' },
          ],
        },
        else: {
          component: 'Row',
          props: { gap: 10 },
          children: [{ component: 'Button', props: { variant: 'solid', big: true, label: 'Set up payment', disabled: '$.starting' }, ref: 'start' }],
        },
      },
    ],
  },
  endpoints: {
    start: { url: `${OWN}/checkout`, method: 'POST', request: {}, target: 'checkout', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'start',
      do: [
        { set: 'error', value: '' },
        { set: 'starting', value: true },
        { call: 'start', onSuccess: [{ set: 'starting', value: false }], onError: [{ set: 'starting', value: false }] },
      ],
    },
  ],
};

export const STRIPE_BUNDLE = {
  integration: 'stripe',
  // THIS INTEGRATION'S OWN WORDS, in the languages it speaks — the host merges
  // them UNDER its own book, so a word lyra already owns keeps lyra's spelling
  // and this file cannot rename it. Keyed by LANGUAGE; a full locale here
  // refuses the whole bundle at intake.
  //
  // The glossary is the host's, not this file's: `State` is Status because
  // that is what a standing reads as everywhere else in the application, and
  // `Money` is Finanzen because that is the hub this screen is placed in. An
  // integration that invents its own vocabulary is a screen that reads like a
  // different product.
  phrasebook: {
    de: {
      Amount: 'Betrag',
      Date: 'Datum',
      State: 'Status',
      Money: 'Finanzen',
      Payment: 'Zahlung',
      Refresh: 'Aktualisieren',
      'Not connected yet': 'Noch nicht verbunden',
      'Payments are not connected': 'Zahlungen sind nicht verbunden',
      'An owner can connect this studio from the Payments settings.':
        'Ein Inhaber kann dieses Studio in den Zahlungs-Einstellungen verbinden.',
      'Checking this studio’s payment status…': 'Zahlungsstatus dieses Studios wird geprüft…',
      'Connect this studio': 'Dieses Studio verbinden',
      'Connecting creates this studio’s own Stripe account. Stripe will ask for the business details it needs before any money can move.':
        'Beim Verbinden entsteht ein eigenes Stripe-Konto für dieses Studio. Stripe fragt die nötigen Geschäftsdaten ab, bevor Geld fließen kann.',
      'Continue on Stripe': 'Bei Stripe fortfahren',
      'Continue to payment': 'Weiter zur Zahlung',
      'Enter business details': 'Geschäftsdaten eingeben',
      'Manage on Stripe': 'Bei Stripe verwalten',
      'Nothing charged yet. Invoices appear here as members pay.':
        'Noch nichts abgerechnet. Rechnungen erscheinen hier, sobald Mitglieder zahlen.',
      'Set up payment': 'Zahlung einrichten',
      'Set up your membership payment. You will be taken to a secure page to enter your card or bank details.':
        'Richte die Zahlung für deine Mitgliedschaft ein. Du wirst auf eine sichere Seite weitergeleitet, um Karten- oder Bankdaten einzugeben.',
      'Setting up with Stripe can take a few passes: it asks for some details, brings you back here, and the next tap asks for the next set. Keep going until this says Ready — you can stop and come back any time.':
        'Die Einrichtung bei Stripe kann mehrere Durchgänge brauchen: Stripe fragt einige Daten ab, bringt dich hierher zurück, und der nächste Tipp fragt den nächsten Satz ab. Mach weiter, bis hier Bereit steht — du kannst jederzeit aufhören und zurückkommen.',
      'Take card and SEPA payments for memberships through Stripe. The studio is the merchant; money goes to the studio’s own account.':
        'Karten- und SEPA-Zahlungen für Mitgliedschaften über Stripe. Das Studio ist der Händler; das Geld geht auf das eigene Konto des Studios.',
      'What has been charged, refunded and disputed at this studio.':
        'Was in diesem Studio abgerechnet, erstattet und reklamiert wurde.',
      'Card and SEPA payments for memberships': 'Karten- und SEPA-Zahlungen für Mitgliedschaften',
      'Card and SEPA payments for memberships, with the studio as the merchant. Invoices and refunds stay with Stripe; this studio keeps standing.':
        'Karten- und SEPA-Zahlungen für Mitgliedschaften, mit dem Studio als Händler. Rechnungen und Erstattungen bleiben bei Stripe; das Studio behält den Status.',
    },
  },
  meta: {
    // THE PROVIDER, not the function. A studio installs "Stripe", and one day
    // "PayPal" or "Mollie" beside it — the store lists WHO processes the money,
    // because that is the choice being made. What they all DO (take payments for
    // memberships) is the tagline, shared across them.
    title: 'Stripe',
    tagline: 'Card and SEPA payments for memberships',
    description: 'Card and SEPA payments for memberships, with the studio as the merchant. Invoices and refunds stay with Stripe; this studio keeps standing.',
  },
  // What it ASKS for. The rung above it (lyra's charter) is the ceiling
  // regardless, and an operator approves this list once at registration.
  grants: {
    actions: ['ext.desk.stripe.*', 'ext.member.stripe.*'],
    data: ['subscriptions.read', 'subscriptions.write.update', 'offerings.read', 'studio_people.read', 'people.read', 'notifications.write.insert'],
  },
  actions: {
    [setupAction.id]: setupAction,
    [ledgerAction.id]: ledgerAction,
    [payAction.id]: payAction,
  },
  placements: { [ledgerAction.id]: 'hub.money', [payAction.id]: 'hub.me' },
  // PAGES THE HOST MAY FRAME. Declared, so lyra will not open one this
  // integration did not publish — including a path it happens to serve.
  //
  // NAMED AGAINST THE SCREEN THAT OPENS IT. The onboarding page belongs to the
  // setup screen, which is a desk action, so a grant for it is mintable by
  // somebody who holds that screen and by nobody else. Without the owner, a
  // member of the studio could be served the form that changes where this
  // studio's money is paid out.
  frames: { [`${OWN}/embed/onboarding`]: setupAction.id },
  settings: setupAction.id,
};
