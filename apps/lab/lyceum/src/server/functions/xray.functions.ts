import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';

// THE X-RAY'S READ (app/actions/xray/): the caller's own screen, as the shell on
// the server runs it — every action on it, whole: its data as it stands now,
// where that data comes from (endpoints), what a tap does (triggers), what it
// does when it opens (lifecycle), and its layout. The definition is the one the
// instance runs, as composed for this person. Their own shell and nobody
// else's: the session is theirs. Printed as JSON, which is what it is. The
// X-ray itself is left out: it would contain the last X-ray.
export const xrayFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'xray.screen': async () =>
    Object.values(session.shell.getState().canvases).flatMap((canvas) =>
      canvas.stack
        .filter((instance) => instance.definitionId !== 'xray.view')
        .flatMap((instance) => {
          const runtime = session.shell.getRuntime(instance.id);
          if (runtime === undefined) return [];
          const action = { ...runtime.definition, data: runtime.getData() };
          return [{ name: runtime.definition.title ?? '', id: instance.definitionId, action: JSON.stringify(action, null, 2) }];
        }),
    ),
});
