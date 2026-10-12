import type { ActionDefinition } from '@niscorp/nova';

const OWN = '/integrations/stripe';

const heading = (title: string, lead: string) => ({ component: 'Hero', props: { title, lead } });

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
        if: '$.loading',
        then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Checking this studio’s payment status…' },
        else: {
          if: '$.account.account_id',
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

              {
                if: '$.account.actionable',
                then: {
                  component: 'Stack',
                  props: { gap: 10 },
                  children: [
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
                  else: {
                    component: 'Row',
                    props: { gap: 10 },
                    children: [{ component: 'Button', props: { variant: 'ghost', label: 'Refresh', disabled: '$.loading' }, ref: 'recheck' }],
                  },
                },
              },
            ],
          },
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
    account: { url: `${OWN}/account`, method: 'POST', request: {}, target: 'account', errorTarget: 'error' },
    connect: { url: `${OWN}/connect`, method: 'POST', request: {}, target: 'account', errorTarget: 'error' },
    onboard: { url: `${OWN}/onboarding-link`, method: 'POST', request: {}, target: 'onboarding', errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      {
        call: 'account',
        onSuccess: [{ set: 'loading', value: false }],
        onError: [{ set: 'loading', value: false }],
      },
    ],
    // The onboarding link is single-use: the used one is dropped so the button
    // offers a fresh one.
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

const ledgerAction: ActionDefinition = {
  id: 'ext.desk.stripe.ledger',
  title: 'Money',
  data: { account: {}, invoices: [], money: {}, refundingId: '', refunded: {}, loading: true, error: '' },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('Money', 'What has been charged, refunded and disputed at this studio.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        if: '$.account.account_id',
        then: {
          component: 'Card',
          props: { pad: 18 },
          children: {
            component: 'Stack',
            props: { gap: 12 },
            children: [
              { component: 'Text', props: { size: 'lg', weight: 'semi' }, children: 'Payouts' },
              {
                component: 'Row',
                props: { gap: 22, wrap: true },
                children: [
                  { component: 'Field', props: { label: 'On the way', value: '$.money.pending_display' } },
                  { component: 'Field', props: { label: 'Ready to pay out', value: '$.money.available_display' } },
                ],
              },
              { if: '$.money.detail', then: { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.money.detail' }, else: '' },
              {
                component: 'Card',
                props: { flush: true },
                children: {
                  component: 'Rows',
                  props: {
                    rows: '$.money.payouts',
                    rowKey: 'payout_id',
                    empty: 'Nothing paid out yet.',
                    columns: [
                      { label: 'Arrives', px: 130, cell: { kind: 'text', key: 'arrives_display', color: 'soft' } },
                      { label: 'Amount', px: 120, cell: { kind: 'primary', key: 'amount_display' } },
                      { label: '', w: 1, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
                    ],
                  },
                },
              },
            ],
          },
        },
        else: '',
      },
      {
        if: '$.account.account_id',
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
                { label: 'Member', w: 2, cell: { kind: 'primary', key: 'person_name' } },
                { label: 'Amount', px: 120, cell: { kind: 'primary', key: 'amount_display' } },
                { label: 'State', px: 130, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
                { label: '', w: 1, cell: { kind: 'text', key: 'note', color: 'soft' } },
                { label: '', px: 96, align: 'right', cell: { kind: 'link', key: 'document_url', label: 'Invoice' } },
                { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Refund', ref: 'refund', variant: 'ghost', hideKey: 'refunded' } },
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
    money: { url: `${OWN}/payouts`, method: 'POST', request: {}, target: 'money' },
    refund: { url: `${OWN}/refund`, method: 'POST', request: { invoiceId: { $ref: '$.refundingId' } }, target: 'refunded', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'account' }, { call: 'money' }, { call: 'invoices', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'refund',
      do: [
        { set: 'error', value: '' },
        { set: 'refundingId', value: '@event.payload.invoice_id' },
        {
          push: {
            action: 'confirm',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              title: 'Refund this payment?',
              message: 'The whole amount goes back to the member. It can take a few days to reach them, and it cannot be undone from here.',
              confirmLabel: 'Refund',
              tone: 'danger',
              channel: 'stripe-refund',
            },
          },
        },
      ],
    },
    { message: 'stripe-refund', do: [{ call: 'refund', onSuccess: [{ call: 'invoices' }] }] },
  ],
};

const payAction: ActionDefinition = {
  id: 'ext.member.stripe.pay',
  title: 'Payment',
  data: { checkout: {}, portal: {}, membership: {}, error: '', starting: false, managing: false },
  layout: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      heading('Payment', 'Set up your membership payment. You will be taken to a secure page to enter your card or bank details.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        if: '$.membership.paid_until_display',
        then: { component: 'Notice', props: { tone: 'good', message: 'Paid up to {{$.membership.paid_until_display}}.' } },
        else: '',
      },
      {
        if: '$.checkout.url',
        // The URL is not followed automatically: a redirect without a click is
        // indistinguishable from a hijack, on the way to a card form.
        then: {
          component: 'Stack',
          props: { gap: 10 },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ready for {{$.checkout.plan_name}}.' },
            { component: 'Button', props: { variant: 'solid', big: true, label: 'Continue to payment', href: '$.checkout.url' }, ref: 'go' },
          ],
        },
        else: {
          component: 'Stack',
          props: { gap: 14 },
          children: [
            {
              component: 'Row',
              props: { gap: 10 },
              children: [{ component: 'Button', props: { variant: 'solid', big: true, label: 'Set up payment', disabled: '$.starting' }, ref: 'start' }],
            },
            {
              if: '$.portal.url',
              then: {
                component: 'Stack',
                props: { gap: 8 },
                children: [
                  { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Your payment details, your invoices, and the card this comes off.' },
                  { component: 'Button', props: { variant: 'outline', label: 'Open payment settings', href: '$.portal.url' }, ref: 'goPortal' },
                ],
              },
              else: { component: 'Button', props: { variant: 'ghost', label: 'Manage payment method', disabled: '$.managing' }, ref: 'manage' },
            },
          ],
        },
      },
    ],
  },
  endpoints: {
    start: { url: `${OWN}/checkout`, method: 'POST', request: {}, target: 'checkout', errorTarget: 'error' },
    manage: { url: `${OWN}/portal`, method: 'POST', request: {}, target: 'portal', errorTarget: 'error' },
    membership: { url: '/api/member/vex', method: 'POST', request: { fingerprint: 'me/membership', context: {} }, target: 'membership' },
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
    {
      event: 'ui:click',
      ref: 'manage',
      do: [
        { set: 'error', value: '' },
        { set: 'managing', value: true },
        { call: 'manage', onSuccess: [{ set: 'managing', value: false }], onError: [{ set: 'managing', value: false }] },
      ],
    },
  ],
  // The redirect back races the webhook: Stripe returns the member the instant
  // they pay, and the standing arrives a second or two later.
  lifecycle: {
    resume: [
      { set: 'portal', value: {} },
      { set: 'checkout', value: {} },
      { call: 'membership' },
    ],
  },
};

const buyAction: ActionDefinition = {
  id: 'ext.member.stripe.buy',
  title: 'Buy',
  data: { items: [], checkout: {}, error: '', loading: true, starting: false },
  layout: {
    component: 'Stack',
    props: { gap: 18 },
    children: [
      heading('Buy a pass', 'Class passes and drop-ins you can pay for now. What you buy is added to your account as soon as the payment goes through.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        if: '$.checkout.url',
        then: {
          component: 'Stack',
          props: { gap: 10 },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ready for {{$.checkout.item_name}}.' },
            { component: 'Button', props: { variant: 'solid', big: true, label: 'Continue to payment', href: '$.checkout.url' }, ref: 'go' },
          ],
        },
        else: {
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.items',
              loading: '$.loading',
              rowKey: 'offering_id',
              empty: 'Nothing on sale just now.',
              emptyHint: 'Ask at the desk about passes.',
              columns: [
                { label: 'Pass', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'allowance_display' } },
                { label: 'Price', px: 110, align: 'right', cell: { kind: 'text', key: 'price_display', color: 'ink' } },
                { label: '', px: 96, align: 'right', cell: { kind: 'action', label: 'Buy', ref: 'buy', variant: 'solid' } },
              ],
            },
          },
        },
      },
    ],
  },
  endpoints: {
    items: { url: '/api/member/vex', method: 'POST', request: { fingerprint: 'offerings/purchasable', context: {} }, target: 'items', errorTarget: 'error' },
    buy: { url: `${OWN}/purchase`, method: 'POST', request: { kind: 'pass', targetId: { $ref: '$.chosenId' } }, target: 'checkout', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'items', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] }] },
  triggers: [
    {
      event: 'ui:click',
      ref: 'buy',
      do: [
        { set: 'error', value: '' },
        { set: 'chosenId', value: '@event.payload.offering_id' },
        { set: 'starting', value: true },
        { call: 'buy', onSuccess: [{ set: 'starting', value: false }], onError: [{ set: 'starting', value: false }] },
      ],
    },
  ],
};


const memberPanelAction: ActionDefinition = {
  id: 'ext.desk.stripe.member',
  title: 'Payments',
  data: { invoices: [], loading: true, error: '' },
  layout: {
    component: 'Stack',
    props: { gap: 12 },
    children: [
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.invoices',
            loading: '$.loading',
            rowKey: 'invoice_id',
            empty: 'Nothing charged to this person yet.',
            columns: [
              { label: 'Date', px: 120, cell: { kind: 'text', key: 'date_display', color: 'soft' } },
              { label: 'Amount', px: 110, cell: { kind: 'primary', key: 'amount_display' } },
              { label: 'State', px: 120, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
              { label: '', px: 96, align: 'right', cell: { kind: 'link', key: 'document_url', label: 'Invoice' } },
            ],
          },
        },
      },
    ],
  },
  endpoints: {
    // `personId` comes from the host: a panel is opened on somebody, and the id
    // rides the input.
    invoices: { url: `${OWN}/member-ledger`, method: 'POST', request: { personId: { $ref: '$.personId' } }, target: 'invoices', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'invoices', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] }] },
};

export const STRIPE_BUNDLE = {
  integration: 'stripe',
  // Keyed by language: a full locale here makes intake refuse the whole bundle.
  // The host merges this under its own book, and host words win.
  phrasebook: {
    de: {
      Amount: 'Betrag',
      Payouts: 'Auszahlungen',
      Arrives: 'Ankunft',
      'On the way': 'Unterwegs',
      'Ready to pay out': 'Auszahlbar',
      'Nothing paid out yet.': 'Noch nichts ausgezahlt.',
      Payments: 'Zahlungen',
      'Nothing charged to this person yet.': 'Für diese Person wurde noch nichts abgerechnet.',
      Refund: 'Erstatten',
      'Refund this payment?': 'Diese Zahlung erstatten?',
      'The whole amount goes back to the member. It can take a few days to reach them, and it cannot be undone from here.':
        'Der volle Betrag geht an das Mitglied zurück. Das kann ein paar Tage dauern und lässt sich hier nicht rückgängig machen.',
      Invoice: 'Rechnung',
      Member: 'Mitglied',
      'Manage payment method': 'Zahlungsmittel verwalten',
      'Open payment settings': 'Zahlungseinstellungen öffnen',
      'Your payment details, your invoices, and the card this comes off.':
        'Deine Zahlungsdaten, deine Rechnungen und die Karte, von der abgebucht wird.',
      Buy: 'Kaufen',
      Pass: 'Blockkarte',
      Price: 'Preis',
      'Buy a pass': 'Blockkarte kaufen',
      'Class passes and drop-ins you can pay for now. What you buy is added to your account as soon as the payment goes through.':
        'Blockkarten und Einzelstunden, die du jetzt bezahlen kannst. Was du kaufst, wird deinem Konto gutgeschrieben, sobald die Zahlung durch ist.',
      'Nothing on sale just now.': 'Zurzeit ist nichts im Verkauf.',
      'Ask at the desk about passes.': 'Frag am Empfang nach Blockkarten.',
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
  grants: {
    actions: ['ext.desk.stripe.*', 'ext.member.stripe.*'],
    data: [
      'subscriptions.read',
      'subscriptions.write.update',
      'offerings.read',
      'studio_people.read',
      'people.read',
      'notifications.write.insert',
      'courses.read',
      'passes.write.insert',
      'enrolments.write.insert',
    ],
  },
  actions: {
    [setupAction.id]: setupAction,
    [ledgerAction.id]: ledgerAction,
    [payAction.id]: payAction,
    [buyAction.id]: buyAction,
    [memberPanelAction.id]: memberPanelAction,
  },
  extension: {
    meta: {
      title: 'Stripe',
      tagline: 'Card and SEPA payments for memberships',
      description: 'Card and SEPA payments for memberships, with the studio as the merchant. Invoices and refunds stay with Stripe; this studio keeps standing.',
    },
    placements: { [ledgerAction.id]: 'hub.money', [payAction.id]: 'hub.me', [buyAction.id]: 'hub.me' },
    attachments: { [memberPanelAction.id]: { to: 'people.detail', preview: `${OWN}/preview/member` } },
    settings: setupAction.id,
  },
};
