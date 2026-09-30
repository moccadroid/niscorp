import { z } from 'zod';
import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { XRAY_REF } from '@lyceum/app/shell/frame.layout';

// THE X-RAY, for a person the speaker gave it to (the `xray` role; without it
// these refuse). Both act on the caller's own shell and nobody else's.
//
//   xray.set       switch it on or off: the frame's `Xray` for this screen
//                  (app/shell/frame.layout.ts). On, the browser outlines every
//                  action on the screen with its id (src/ui/target.ts).
//   xray.document  one action instance on this screen, whole, as the shell runs
//                  it: its definition as composed for this person, with its
//                  data as it stands now. Printed as JSON, which is what it is.
//
// A function endpoint is handed its action's data: the phone's `xray` (what the
// button now says), the document's `instanceId` (which action it shows).
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
      session.shell.setLayout(XRAY_REF, { component: 'Xray', props: { on: xray } });
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
