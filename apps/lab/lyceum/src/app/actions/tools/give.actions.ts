import type { ActionDefinition } from '@niscorp/nova';
import type { SeedEntry, SeedMutation } from '@niscorp/vex';
import { askerGive, askerGiven, askerTake, assistantGive, assistantGiven, assistantTake, EVERYBODY, questionsGive, questionsGiven, questionsTake, screensGive, screensGiven, screensTake, xrayGive, xrayGiven, xrayTake } from '@lyceum/app/vex/grant.entries';

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

// The ask (app/actions/ask/): a question about the room, in words, on every phone.
export const askerTool = giveTool({
  id: 'tools.asker',
  title: 'The ask',
  kicker: 'The ask — on everybody’s phone',
  give: 'Give everybody the ask',
  entries: { given: askerGiven, give: askerGive, take: askerTake },
});

// The Nova talk's framework bar on every phone: each person picks what draws their own phone.
export const screensGiveTool = giveTool({
  id: 'tools.screens-give',
  title: 'The framework bar on phones',
  kicker: 'The framework bar — on everybody’s phone',
  give: 'Give everybody the framework bar',
  entries: { given: screensGiven, give: screensGive, take: screensTake },
});

// The Q&A on every phone: a question for the speaker, judged by the moderator before anything shows it.
export const questionsGiveTool = giveTool({
  id: 'tools.questions-give',
  title: 'The Q&A on phones',
  kicker: 'The Q&A on everybody’s phone',
  give: 'Give everybody the Q&A',
  entries: { given: questionsGiven, give: questionsGive, take: questionsTake },
});
