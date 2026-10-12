import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

const menuLayout: LayoutNode = {
  component: 'Row',
  props: { gap: 4, wrap: true, align: 'center' },
  children: [
    {
      for: '$.entries',
      as: 'e',
      key: 'action_id',
      do: {
        component: 'NavItem',
        ref: 'open',
        props: { label: '$e.title', icon: '$e.icon', value: '$e', active: { $eq: ['$e.action_id', '$.openId'] } },
      },
    },
  ],
};

export const staffMenuAction: ActionDefinition = {
  id: 'staff.menu',
  title: 'Everything here',
  data: { propertyId: '', staffId: '', audience: '', entries: [], openId: '' },
  layout: menuLayout,
  endpoints: {
    load: {
      url: '/api/surface/vex',
      method: 'POST',
      request: { fingerprint: 'surface/menu', context: { propertyId: { $ref: '$.propertyId' }, audience: { $ref: '$.audience' } } },
      target: 'entries',
    },
  },
  lifecycle: {
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'openId', from: 'entries.0.action_id' },
          { resetTo: { action: '{{$.entries.0.action_id}}', canvas: 'work', input: { propertyId: '$.propertyId', staffId: '$.staffId' } } },
        ],
      },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'open',
      do: [
        { set: 'openId', value: '@event.payload.action_id' },
        { emit: { channel: 'work-reset' } },
        { resetTo: { action: '{{@event.payload.action_id}}', canvas: 'work', input: { propertyId: '$.propertyId', staffId: '$.staffId' } } },
      ],
    },
    { message: 'surface-changed', do: [{ call: 'load' }] },
  ],
};

export const staffMenuInputSchema = z.toJSONSchema(
  z.object({
    propertyId: z.string().optional().describe('Seeded by the chrome from the session; never client-authored.'),
    staffId: z.string().optional().describe('Seeded by the chrome from the session; handed to whatever the menu opens, because a staff surface asks whose work it is.'),
    audience: z.string().optional().describe('Seeded from the session; decides which slice of the resolved surface is listed.'),
  }),
);
