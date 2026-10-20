import { z } from 'zod';
import type { FunctionDefinition, FunctionSession } from '@niscorp/moss';
import { XRAY_REF } from '@lyceum/app/shell/frame.layout';
import { unverifiedShell } from '@niscorp/moss/unverified';

const SetSchema = z.looseObject({ xray: z.boolean() });
const DocumentSchema = z.looseObject({ instanceId: z.string() });

export const xrayFunctions = (session: FunctionSession): FunctionDefinition[] => {
  const given = (): void => {
    if (!session.actions.includes('xray.document')) throw new Error('The X-ray was not given to you.');
  };
  return [
    {
      id: 'xray.set',
      description: 'Turns the X-ray over the screen on or off. Send { xray: boolean }; answers { on }.',
      execute: async (body) => {
        given();
        const { xray } = SetSchema.parse(body);
        unverifiedShell(session).setLayout(XRAY_REF, { component: 'Xray', props: { on: xray } });
        return { on: xray };
      },
    },
    {
      id: 'xray.document',
      description: 'Answers an action on the screen as it runs: its definition and its data, as JSON. Send { instanceId }; answers { json }.',
      execute: async (body) => {
        given();
        const { instanceId } = DocumentSchema.parse(body);
        const runtime = session.shell.getRuntime(instanceId);
        if (runtime === undefined) throw new Error('That action is no longer on your screen.');
        return { json: JSON.stringify({ ...runtime.definition, data: runtime.getData() }, null, 2) };
      },
    },
  ];
};
