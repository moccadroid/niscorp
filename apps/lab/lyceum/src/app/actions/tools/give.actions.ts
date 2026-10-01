import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { memberRegister } from '@lyceum/app/vex/member.entries';
import { assistantGive, assistantGiven, assistantTake, xrayGive, xrayGiven, xrayTake } from '@lyceum/app/vex/grant.entries';

// A CONTROLLER TOOL THAT GIVES EVERYBODY SOMETHING, or takes it back — the
// X-ray and the assistant are both this. Giving writes a grant row per member
// who has joined (vex/grant.entries.ts); their shells are rebuilt and the
// action is a block on their phone's list. Taking it back deletes the rows.
// How many have it is a reactive read, so the tool follows.
const giveTool = (tool: { id: string; title: string; kicker: string; give: string; entries: { given: SeedEntry; give: SeedMutation; take: SeedMutation } }): ActionDefinition => ({
  id: tool.id,
  title: tool.title,
  data: { members: [], has: { count: 0, given: false }, error: '' },
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
          { component: 'Figure', props: { label: 'People who have it', value: '$.has.count' } },
          { if: '$.error', then: { component: 'Text', children: '{{$.error.message}}' } },
        ],
      },
    ],
  },
  endpoints: {
    members: { url: '/api/vex', method: 'POST', request: { fingerprint: memberRegister.fingerprint, context: {} }, target: 'members' },
    given: { url: '/api/vex', method: 'POST', request: { fingerprint: tool.entries.given.fingerprint, context: {} }, target: 'has' },
    give: { url: '/api/vex', method: 'POST', request: { fingerprint: tool.entries.give.fingerprint, context: { members: { $ref: '$.members' } } }, errorTarget: 'error' },
    take: {
      url: '/api/vex',
      method: 'POST',
      request: { fingerprint: tool.entries.take.fingerprint, context: { members: { $pluck: { over: { $ref: '$.members' }, key: 'member_id' } } } },
      errorTarget: 'error',
    },
  },
  lifecycle: { mount: [{ call: 'members' }, { call: 'given' }] },
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
