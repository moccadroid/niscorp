import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { XRAY_REF } from '@lyceum/app/shell/frame.layout';
import { unverifiedShell } from '@niscorp/moss/unverified';

const SetSchema = z.looseObject({ xray: z.boolean() });
const DocumentSchema = z.looseObject({ instanceId: z.string() });

export const xrayFunctions = (session: FunctionSession): Record<string, FunctionHandler> => {
  const given = (): void => {
    if (!session.actions.includes('xray.document')) throw new Error('The X-ray was not given to you.');
  };
  return {
    'xray.set': async (body) => {
      given();
      const { xray } = SetSchema.parse(body);
      unverifiedShell(session).setLayout(XRAY_REF, { component: 'Xray', props: { on: xray } });
      return { on: xray };
    },
    'xray.document': async (body) => {
      given();
      const { instanceId } = DocumentSchema.parse(body);
      const runtime = session.shell.getRuntime(instanceId);
      if (runtime === undefined) throw new Error('That action is no longer on your screen.');
      return { json: JSON.stringify({ ...runtime.definition, data: runtime.getData() }, null, 2) };
    },
  };
};
