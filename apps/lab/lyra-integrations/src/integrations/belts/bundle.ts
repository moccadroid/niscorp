import type { ActionDefinition } from '@niscorp/nova';

const heading = (title: string, lead: string) => ({
  component: 'Hero',
  props: { title, lead },
});

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
    belts: { url: '/integrations/belts/roster', method: 'POST', request: {}, target: 'belts' },
    members: {
      url: '/api/member/vex',
      method: 'POST',
      request: { fingerprint: 'people/list', context: { holding: 'membership' } },
      target: 'members',
    },
  },
  lifecycle: {
    mount: [
      {
        call: 'members',
        onSuccess: [
          {
            call: 'belts',
            onSuccess: [
              {
                set: 'rows',
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
  // Keyed by language: a full locale here makes intake refuse the whole bundle.
  // The host merges this under its own book, and host words win.
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
  grants: {
    actions: ['ext.desk.belts.*', 'ext.member.belts.*'],
    data: ['studio_people.read', 'people.read'],
  },
  actions: {
    [panelAction.id]: panelAction,
    [rosterAction.id]: rosterAction,
    [mineAction.id]: mineAction,
    [settingsAction.id]: settingsAction,
  },
  extension: {
    meta: {
      title: 'Belts',
      tagline: 'Rank tracking for grappling gyms',
      description: 'Belts, promotion dates and class counts, kept in the add-on’s own storage. Promotions land in the studio’s notifications.',
    },
    attachments: { [panelAction.id]: { to: 'people.detail', preview: '/integrations/belts/preview' } },
    placements: { [rosterAction.id]: 'hub.people', [mineAction.id]: 'hub.me' },
    settings: settingsAction.id,
  },
};
