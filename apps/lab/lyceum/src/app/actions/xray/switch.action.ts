import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';

export const xraySwitchAction: ActionDefinition = {
  id: 'xray.switch',
  description: 'The X-ray: turn it on to see the actions the screen is made of, each with its id; tap an id to read that action as JSON.',
  title: 'X-ray',
  data: { xray: false },
  input: z.toJSONSchema(z.object({})),
  layout: {
    component: 'Sheet',
    props: { areas: ['kick kick', 'say flip'], cols: [2, 1] },
    children: [
      { component: 'Cell', props: { area: 'kick', ink: 'signal' }, children: [{ component: 'Label', children: 'X-ray' }] },
      {
        component: 'Cell',
        props: { area: 'say' },
        children: [
          {
            if: '$.xray',
            then: { component: 'Text', children: 'Every action on your screen is outlined. Tap an id.' },
            else: { component: 'Text', children: 'See the actions your screen is made of.' },
          },
        ],
      },
      { component: 'Action', ref: 'flip', props: { area: 'flip', ink: { $if: '$.xray', $then: 'signal', $else: 'paper' }, label: { $if: '$.xray', $then: 'On', $else: 'Off' } } },
    ],
  },
  endpoints: { xray: { fn: 'xray.set' } },
  triggers: [{ event: 'ui:click', ref: 'flip', do: [{ toggle: 'xray' }, { call: 'xray' }] }],
};
