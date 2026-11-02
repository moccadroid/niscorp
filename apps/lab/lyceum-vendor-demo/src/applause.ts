import type { ActionDefinition } from '@niscorp/nova';

// Applause, a made-up company's integration for the Nova talk: a Clap button on
// every phone, and the room's count on the projector. Data only, calling
// lyceum's own claps queries.
export const clap: ActionDefinition = {
  id: 'ext.member.applause.clap',
  title: 'Applause',
  description: 'Applause: clap for the speaker, as often as you like.',
  data: { clapped: false, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'clap', 'out'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'highlight' }, children: [{ component: 'Label', children: 'Applause' }] },
      { component: 'Action', ref: 'clap', props: { area: 'clap', ink: 'highlight', size: 'large', label: '👏 Clap' } },
      {
        if: '$.error',
        then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: '{{$.error.message}}' }] },
        else: {
          if: '$.clapped',
          then: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', children: 'Heard. Again?' }] },
          else: { component: 'Cell', props: { area: 'out' }, children: [{ component: 'Text', props: { tone: 'muted' }, children: 'An integration, installed from outside this app.' }] },
        },
      },
    ],
  },
  endpoints: {
    clap: { url: '/api/vex', method: 'POST', request: { fingerprint: 'claps/clap', context: {} }, errorTarget: 'error' },
  },
  triggers: [{ event: 'ui:click', ref: 'clap', do: [{ set: 'error', value: '' }, { call: 'clap', onSuccess: [{ set: 'clapped', value: true }] }] }],
};

export const meter: ActionDefinition = {
  id: 'ext.stage.applause.meter',
  title: 'Applause · The room',
  description: 'Applause, on the projector: how many times the room clapped.',
  data: { claps: { count: 0 } },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick', 'count'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'highlight' }, children: [{ component: 'Label', children: 'Applause' }] },
      { component: 'Cell', props: { area: 'count' }, children: [{ component: 'Figure', props: { label: 'Claps from the room', value: '{{$.claps.count}}' } }] },
    ],
  },
  // Reactive on lyceum's side: a clap arrives on its own.
  endpoints: {
    claps: { url: '/api/vex', method: 'POST', request: { fingerprint: 'claps/count', context: {} }, target: 'claps' },
  },
  lifecycle: { mount: [{ call: 'claps' }] },
  triggers: [],
};

export const APPLAUSE_BUNDLE = {
  integration: 'applause',
  grammar: { 'nisc.nova': 2, 'nisc.prism': 3, 'lyceum.kit': 20 },
  actions: { [clap.id]: clap, [meter.id]: meter },
  extension: {
    attachments: { [clap.id]: 'member.phone', [meter.id]: 'slide.nova-stranger' },
  },
};
