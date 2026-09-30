import type { FunctionSession } from '@niscorp/moss';
import type { FunctionHandler } from '@niscorp/nova';

// THE X-RAY'S READ (app/actions/xray/): the caller's own screen, as the shell on
// the server holds it — every canvas, every action instance on it, and that
// instance's data, exactly as it stands. Their own shell and nobody else's:
// the session is theirs. The data is printed as JSON, which is what it is.
// The X-ray's own view is left out: it would contain the last X-ray.
export const xrayFunctions = (session: FunctionSession): Record<string, FunctionHandler> => ({
  'xray.screen': async () =>
    Object.values(session.shell.getState().canvases).flatMap((canvas) =>
      canvas.stack.filter((instance) => instance.definitionId !== 'xray.view').map((instance) => ({ canvas: canvas.id, action: instance.definitionId, data: JSON.stringify(instance.data, null, 2) })),
    ),
});
