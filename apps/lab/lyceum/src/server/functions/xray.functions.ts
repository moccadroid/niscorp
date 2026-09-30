import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';
import { ACTIONS } from '@lyceum/app/action-catalog';

// THE X-RAY'S READ (app/actions/xray/): the caller's own screen, as the shell on
// the server holds it — every action on it, named by its title and its id, and its
// data exactly as it stands. Their own shell and nobody else's: the session is
// theirs. The data is printed as JSON, which is what it is. The X-ray itself
// is left out: it would contain the last X-ray.
export const xrayFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'xray.screen': async () =>
    Object.values(session.shell.getState().canvases).flatMap((canvas) =>
      canvas.stack
        .filter((instance) => instance.definitionId !== 'xray.view')
        .map((instance) => ({ name: ACTIONS[instance.definitionId]?.title ?? '', id: instance.definitionId, data: JSON.stringify(instance.data, null, 2) })),
    ),
});
