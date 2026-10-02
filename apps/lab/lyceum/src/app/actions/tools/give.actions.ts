import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { assistantGive, assistantGiven, assistantTake, EVERYBODY, xrayGive, xrayGiven, xrayTake } from '@lyceum/app/vex/grant.entries';

// A CONTROLLER TOOL THAT GIVES EVERYBODY SOMETHING, or takes it back — the
// X-ray and the assistant are both this. Giving writes ONE grant row, for
// `everybody` (vex/grant.entries.ts): every member's shell is rebuilt and the
// action is a block on their phone's list — and on the phone of whoever joins
// later, because their roles are read from that same row. Taking it back
// deletes it. Whether it is given is a reactive read, so the tool follows.
const giveTool = (tool: { id: string; title: string; kicker: string; give: string; entries: { given: SeedEntry; give: SeedMutation; take: SeedMutation } }): ActionDefinition => ({
  id: tool.id,
  title: tool.title,
  data: { has: { count: 0, given: false, state: 'Nobody' }, error: '' },
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'give take', 'count count'] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'ink' }, children: [{ component: 'Label', children: tool.kicker }] },
      { component: 'Action', ref: 'give', props: { area: 'give', ink: { $if: '$.has.given', $then: 'highlight', $else: 'signal' }, label: tool.give } },
      { component: 'Action', ref: 'take', props: { area: 'take', ink: 'paper', label: 'Take it back' } },
      {
        component: 'Cell',
        props: { area: 'count' },
        children: [
          { component: 'Figure', props: { label: 'Who has it, late joiners included', value: '$.has.state' } },
          { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        ],
      },
    ],
  },
  endpoints: {
    given: { url: '/api/vex', method: 'POST', request: { fingerprint: tool.entries.given.fingerprint, context: {} }, target: 'has' },
    give: { url: '/api/vex', method: 'POST', request: { fingerprint: tool.entries.give.fingerprint, context: { to: EVERYBODY } }, errorTarget: 'error' },
    take: { url: '/api/vex', method: 'POST', request: { fingerprint: tool.entries.take.fingerprint, context: { to: EVERYBODY } }, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'given' }] },
  triggers: [
    { event: 'ui:click', ref: 'give', do: [{ set: 'error', value: '' }, { call: 'give' }] },
    { event: 'ui:click', ref: 'take', do: [{ set: 'error', value: '' }, { call: 'take' }] },
  ],
});

export const xrayTool = giveTool({ id: 'tools.xray', title: 'The X-ray', kicker: 'X-ray — everybody’s own screen, as data', give: 'Give everybody the X-ray', entries: { given: xrayGiven, give: xrayGive, take: xrayTake } });

export const assistantTool = giveTool({
  id: 'tools.assistant',
  title: 'The assistant',
  kicker: 'The assistant — on everybody’s phone',
  give: 'Give everybody the assistant',
  entries: { given: assistantGiven, give: assistantGive, take: assistantTake },
});
