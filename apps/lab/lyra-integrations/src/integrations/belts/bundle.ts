import type { ActionDefinition } from '@niscorp/nova';

// BELTS — a discipline integration for a grappling gym, shipped from outside.
//
// This file may not import anything from Lyra. Not a fingerprint constant, not
// a component name, not a type. Everything it knows about the app it extends
// came from `GET /api/integrations/contract`, which is why that endpoint exists.
//
// It stores its own records. A belt is not a column beside `memberships` — it
// lives in this service, keyed by the `person_id` the assertion (or the
// host screen) hands over. That is the whole reason a discipline integration does not
// need a migration in Lyra: the two systems share identifiers, not tables.
//
// WHERE ITS SCREENS GO is declared at the bottom, beside the actions and never
// on them: the panel rides the member detail, the roster lists under People,
// the member's own view lists under their Booking area, and the settings
// screen surfaces on the store tile and nowhere else. Add-ons is a store; this
// bundle puts nothing in it but words and one settings door.

const heading = (title: string, lead: string) => ({
  component: 'Hero',
  props: { title, lead },
});

// ── the panel that rides the member record ───────────────────
//
// Attached to `people.detail`, so it opens WITH a member on screen and is
// handed exactly what that screen offers: the membership id and the person's
// name. No name or id renders here — the host screen owns identity; this
// panel owns the belt.
const panelAction: ActionDefinition = {
  id: 'ext.desk.belts.panel',
  title: 'Belt',
  data: { person_id: '', person_name: '', belt: {}, loading: true, error: '' },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('Belt', 'Where they are, and what is next.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        component: 'Card',
        props: { pad: 22 },
        children: {
          component: 'Row',
          props: { gap: 22, wrap: true, align: 'end' },
          children: [
            // THE BELT ITSELF, not the word for it. The bands arrive on the
            // record — this integration owns what a grappling belt looks like; the
            // kit only knows how to paint segments.
            {
              component: 'Stack',
              props: { gap: 6 },
              children: [
                { component: 'Text', props: { size: 'xs', color: 'mute', uppercase: true, weight: 'medium' }, children: 'Belt' },
                { component: 'Bands', props: { bands: '$.belt.bands', w: 168, h: 16 } },
                { component: 'Text', props: { size: 'sm', color: 'soft' }, children: '$.belt.label' },
              ],
            },
            { component: 'Stat', props: { label: 'Since', value: '$.belt.since' } },
            { component: 'Stat', props: { label: 'Classes', value: '$.belt.classes' } },
            // THREE VERBS, THREE WEIGHTS. A stripe is the everyday act — tape
            // on the bar after class — so it wears the quiet button. A
            // promotion is the ceremony. Undo winds the ledger back one step
            // and only exists while there is a step to unwind. Every one of
            // them ASKS first: the clicks push Lyra's own `confirm` sheet
            // (granted to everybody at the base rung) and the work fires only
            // when its channel answers yes — this integration could not perform the
            // change from inside the question if it wanted to.
            {
              if: '$.belt.can_stripe',
              then: { component: 'Button', props: { variant: 'ghost', label: 'Add stripe' }, ref: 'stripe' },
              else: '',
            },
            {
              if: '$.belt.next',
              then: { component: 'Button', props: { variant: 'outline', label: 'Promote' }, ref: 'promote' },
              else: '',
            },
            {
              if: '$.belt.can_undo',
              then: { component: 'Button', props: { variant: 'ghost', label: 'Undo' }, ref: 'undo' },
              else: '',
            },
          ],
        },
      },
      {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.belt.history',
            loading: '$.loading',
            rowKey: 'on',
            headers: false,
            empty: 'No gradings recorded.',
            columns: [
              { label: '', px: 112, cell: { kind: 'bands', key: 'bands' } },
              { label: '', w: 1, cell: { kind: 'primary', key: 'label' } },
              { label: '', px: 130, cell: { kind: 'text', key: 'on', color: 'soft' } },
            ],
          },
        },
      },
    ],
  },
  endpoints: {
    belt: { url: '/integrations/belts/member', method: 'POST', request: { personId: { $ref: '$.person_id' } }, target: 'belt', errorTarget: 'error' },
    // Promote answers with the updated record, so one call both writes and
    // repaints. Behind it the service also acts AS ITSELF: its key carries a
    // notification into Lyra's inbox — the panel neither knows nor needs to.
    promote: {
      url: '/integrations/belts/promote',
      method: 'POST',
      request: { personId: { $ref: '$.person_id' }, personName: { $ref: '$.person_name' } },
      target: 'belt',
      errorTarget: 'error',
    },
    stripe: {
      url: '/integrations/belts/stripe',
      method: 'POST',
      request: { personId: { $ref: '$.person_id' }, personName: { $ref: '$.person_name' } },
      target: 'belt',
      errorTarget: 'error',
    },
    undo: {
      url: '/integrations/belts/undo',
      method: 'POST',
      request: { personId: { $ref: '$.person_id' }, personName: { $ref: '$.person_name' } },
      target: 'belt',
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'belt', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] }] },
  triggers: [
    // Each click ASKS; each answer WORKS. The channels are namespaced to this
    // integration so two integrations confirming on one screen cannot hear each
    // other's yes.
    {
      event: 'ui:click',
      ref: 'stripe',
      do: [
        {
          push: {
            action: 'confirm',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              title: 'Add a stripe?',
              message: 'Tapes the {{$.belt.next_stripe}} stripe on {{$.belt.belt}} for {{$.person_name}}. Undo takes it off again.',
              confirmLabel: 'Add the stripe',
              tone: 'solid',
              channel: 'belts-stripe-confirmed',
            },
          },
        },
      ],
    },
    { message: 'belts-stripe-confirmed', do: [{ set: 'error', value: '' }, { call: 'stripe' }] },
    {
      event: 'ui:click',
      ref: 'promote',
      do: [
        {
          push: {
            action: 'confirm',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              title: 'Promote to {{$.belt.next}}?',
              message: 'Ties the {{$.belt.next}} belt on {{$.person_name}}. The bar resets — stripes belong to the belt they were earned on.',
              confirmLabel: 'Promote',
              tone: 'solid',
              channel: 'belts-promote-confirmed',
            },
          },
        },
      ],
    },
    { message: 'belts-promote-confirmed', do: [{ set: 'error', value: '' }, { call: 'promote' }] },
    {
      event: 'ui:click',
      ref: 'undo',
      do: [
        {
          push: {
            action: 'confirm',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              title: 'Undo the last change?',
              message: 'Winds the record back one step: {{$.person_name}} returns to {{$.belt.undo_label}}.',
              confirmLabel: 'Undo it',
              tone: 'danger',
              channel: 'belts-undo-confirmed',
            },
          },
        },
      ],
    },
    { message: 'belts-undo-confirmed', do: [{ set: 'error', value: '' }, { call: 'undo' }] },
  ],
};

// ── the roster, under People where it belongs ────────────────
//
// Two reads, one screen: the roll from Lyra (a fingerprint the contract
// advertises), the belts from here. The JOIN happens below, in the action —
// belts keyed by membership id meet the roll's names, so the desk reads
// "Omar Haddad · Purple", never an identifier. Neither system learned the
// other's storage for that to work; they share ids, and the screen composes.
const rosterAction: ActionDefinition = {
  id: 'ext.desk.belts.roster',
  title: 'Belts',
  data: { members: [], belts: [], rows: [], loading: true },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('Belts', 'Who holds what, and who is due.'),
      {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.rows',
            loading: '$.loading',
            rowKey: 'person_id',
            empty: 'Nobody graded yet.',
            emptyHint: 'Belts are recorded here and stay here.',
            columns: [
              { label: 'Member', w: 2, cell: { kind: 'primary', key: 'person_name' } },
              { label: 'Belt', px: 112, cell: { kind: 'bands', key: 'bands' } },
              { label: '', px: 150, cell: { kind: 'text', key: 'belt', color: 'soft' } },
              { label: 'Since', px: 120, cell: { kind: 'text', key: 'since', color: 'soft' } },
            ],
          },
        },
      },
    ],
  },
  endpoints: {
    // OURS. A URL under our own prefix — intake refuses anything else.
    belts: { url: '/integrations/belts/roster', method: 'POST', request: {}, target: 'belts' },
    // THEIRS. A fingerprint the contract listed. We do not know what table it
    // reads and cannot ask. The lens is a CONTEXT VALUE now rather than part of
    // the name, and the search is optional — an integration asking for the members
    // lens sends the lens and nothing else, with no wildcard to know about.
    members: {
      url: '/api/member/vex',
      method: 'POST',
      request: { fingerprint: 'people/list', context: { lens: 'members' } },
      target: 'members',
    },
  },
  lifecycle: {
    // Sequenced, because the join needs both answers — and the join is the
    // whole point: a roster of ids was this action's first recorded fault,
    // fetching the roll and never reading it.
    mount: [
      {
        call: 'members',
        onSuccess: [
          {
            call: 'belts',
            onSuccess: [
              {
                set: 'rows',
                // `$prism` is the explicit door to the transform grammar — and
                // the ROLL drives the map, not the belt records: there is no
                // unranked, so every member is on the wall, and one with no
                // record yet is a white belt with an empty bar. The white-belt
                // fallback is a literal because what a white belt looks like is
                // THIS integration's knowledge, written where it composes.
                value: {
                  $prism: {
                  $with: {
                    let: {
                      byBelt: { $keyBy: { over: { $ref: '$.belts' }, as: 'b', key: { $get: { from: { $var: 'b' }, path: ['person_id'] } } } },
                    },
                    value: {
                      $map: {
                        over: { $ref: '$.members' },
                        as: 'm',
                        body: {
                          person_id: { $get: { from: { $var: 'm' }, path: ['person_id'] } },
                          person_name: { $get: { from: { $var: 'm' }, path: ['person_name'] } },
                          belt: {
                            $get: {
                              from: { $var: 'byBelt' },
                              path: [{ $get: { from: { $var: 'm' }, path: ['person_id'] } }, 'label'],
                              fallback: 'White',
                            },
                          },
                          bands: {
                            $get: {
                              from: { $var: 'byBelt' },
                              path: [{ $get: { from: { $var: 'm' }, path: ['person_id'] } }, 'bands'],
                              fallback: ['#e9e7e2', '#e9e7e2', '#e9e7e2', { color: '#141416', w: 2 }, '#e9e7e2'],
                            },
                          },
                          since: {
                            $get: {
                              from: { $var: 'byBelt' },
                              path: [{ $get: { from: { $var: 'm' }, path: ['person_id'] } }, 'since'],
                              fallback: '—',
                            },
                          },
                        },
                      },
                    },
                  },
                  },
                },
              },
              { set: 'loading', value: false },
            ],
          },
        ],
      },
    ],
  },
};

// ── what a member sees, in their own area ────────────────────
const mineAction: ActionDefinition = {
  id: 'ext.member.belts.mine',
  title: 'My belt',
  data: { belt: {}, loading: true },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('My belt', 'Where you are, and what is next.'),
      {
        component: 'Card',
        props: { pad: 22 },
        children: {
          component: 'Row',
          props: { gap: 22, wrap: true },
          children: [
            {
              component: 'Stack',
              props: { gap: 6 },
              children: [
                { component: 'Text', props: { size: 'xs', color: 'mute', uppercase: true, weight: 'medium' }, children: 'Belt' },
                { component: 'Bands', props: { bands: '$.belt.bands', w: 168, h: 16 } },
                { component: 'Text', props: { size: 'sm', color: 'soft' }, children: '$.belt.label' },
              ],
            },
            { component: 'Stat', props: { label: 'Since', value: '$.belt.since' } },
            { component: 'Stat', props: { label: 'Classes', value: '$.belt.classes' } },
          ],
        },
      },
    ],
  },
  endpoints: { belt: { url: '/integrations/belts/mine', method: 'POST', request: {}, target: 'belt' } },
  lifecycle: { mount: [{ call: 'belt', onSuccess: [{ set: 'loading', value: false }] }] },
};

// ── the settings door, on the store tile and nowhere else ────
//
// "What belts exist" is this integration's own configuration — rows in ITS storage,
// reachable only from the Add-ons tile once a studio has it on. Nothing here
// is a screen anybody works in; it is how the integration is set up.
const settingsAction: ActionDefinition = {
  id: 'ext.desk.belts.settings',
  title: 'Belt settings',
  data: { ranks: [], newRank: '', error: '', loading: true },
  layout: {
    component: 'Stack',
    props: { gap: 22 },
    children: [
      heading('Belt settings', 'The ranks this add-on grades through, in order.'),
      { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error.message' } }, else: '' },
      {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.ranks',
            loading: '$.loading',
            rowKey: 'name',
            headers: false,
            empty: 'No ranks defined.',
            columns: [
              { label: '', px: 112, cell: { kind: 'bands', key: 'bands' } },
              { label: '', w: 1, cell: { kind: 'primary', key: 'name' } },
            ],
          },
        },
      },
      {
        component: 'Card',
        props: { pad: 16 },
        children: {
          component: 'Row',
          props: { gap: 12, wrap: true, align: 'end' },
          children: [
            { component: 'Input', props: { label: 'New rank', placeholder: 'Coral' }, ref: 'newRank', model: '$.newRank' },
            { component: 'Button', props: { variant: 'outline', label: 'Add rank' }, ref: 'add' },
          ],
        },
      },
    ],
  },
  endpoints: {
    ranks: { url: '/integrations/belts/ranks', method: 'POST', request: {}, target: 'ranks', errorTarget: 'error' },
    add: { url: '/integrations/belts/ranks/add', method: 'POST', request: { name: { $ref: '$.newRank' } }, target: 'ranks', errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'ranks', onSuccess: [{ set: 'loading', value: false }], onError: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'newRank', do: [{ set: 'newRank', value: '@event.payload' }] },
    { event: 'ui:click', ref: 'add', do: [{ set: 'error', value: '' }, { call: 'add', onSuccess: [{ set: 'newRank', value: '' }] }] },
  ],
};

export const BELTS_BUNDLE = {
  integration: 'belts',
  // THE INTEGRATION'S OWN WORDS, in the languages it speaks — the host merges this
  // under its OWN book (host words win) and the language pass covers these
  // screens with everything else. Keyed by LANGUAGE, per the contract; a
  // full locale here refuses the whole bundle at intake.
  phrasebook: {
    de: {
      Belts: 'Gürtel',
      Belt: 'Gürtel',
      'My belt': 'Mein Gürtel',
      'Belt settings': 'Gürtel-Einstellungen',
      'Who holds what, and who is due.': 'Wer welchen Gürtel trägt — und wer dran ist.',
      Since: 'Seit',
      Classes: 'Kurse',
      'Add stripe': 'Streifen hinzufügen',
      Promote: 'Befördern',
      Undo: 'Rückgängig',
      'No gradings recorded.': 'Noch keine Graduierungen erfasst.',
      'Belts are recorded here and stay here.': 'Gürtel werden hier erfasst und bleiben hier.',
      'Where they are, and what is next.': 'Wo sie stehen — und was als Nächstes kommt.',
      'Where you are, and what is next.': 'Wo du stehst — und was als Nächstes kommt.',
      // The example rank in a placeholder, a colour like the host's own Lime.
      Coral: 'Koralle',
      Member: 'Mitglied',
      'Nobody graded yet.': 'Noch niemand graduiert.',
      'The ranks this add-on grades through, in order.': 'Die Ränge, die dieses Add-on vergibt, in Reihenfolge.',
      'No ranks defined.': 'Keine Ränge definiert.',
      'New rank': 'Neuer Rang',
      'Add rank': 'Rang hinzufügen',
      'Rank tracking for grappling gyms': 'Gürtel und Grade für Kampfsport-Studios',
      'Belts, promotion dates and class counts, kept in the add-on’s own storage. Promotions land in the studio’s notifications.':
        'Gürtel, Graduierungsdaten und Kurszahlen, im eigenen Speicher des Add-ons. Graduierungen landen in den Mitteilungen des Studios.',
    },
  },
  // WORDS, for the store tile and the approval card. Never parsed, never
  // trusted for anything but reading.
  meta: {
    title: 'Belts',
    tagline: 'Rank tracking for grappling gyms',
    description: 'Belts, promotion dates and class counts, kept in the add-on’s own storage. Promotions land in the studio’s notifications.',
  },
  // WHAT WE NEED, which somebody approves once. Asking is not getting: until an
  // operator says yes, nothing here is served and the data grants are not held.
  grants: {
    actions: ['ext.desk.belts.*', 'ext.member.belts.*'],
    // The roll it joins against: the anchor and the person. Standing derives
    // from the anchor's own mirrors, so nothing else is asked for. Read as
    // the person DRIVING — this is what the screens need, not what the
    // integration's key holds.
    data: ['studio_people.read', 'people.read'],
  },
  actions: {
    [panelAction.id]: panelAction,
    [rosterAction.id]: rosterAction,
    [mineAction.id]: mineAction,
    [settingsAction.id]: settingsAction,
  },
  // THE BINDINGS — beside the artifacts, never on them. Each names a target
  // the contract advertised; intake refuses anything else with a sentence.
  attachments: { [panelAction.id]: { to: 'people.detail', preview: '/integrations/belts/preview' } },
  placements: { [rosterAction.id]: 'hub.people', [mineAction.id]: 'hub.me' },
  // Pages the host may FRAME — declared here for the same reason a preview is:
  // the host will not open one it was not told about. Belts serves this to
  // exercise the seam; an integration whose screens are ordinary layouts needs
  // none.
  //
  // The value names the screen the page belongs to, so the grant can be checked
  // against the charter rather than only against the install. The roster is a
  // desk screen, so this summary is a desk page — a member holds neither.
  frames: { '/integrations/belts/embed/summary': rosterAction.id },
  settings: settingsAction.id,
};
