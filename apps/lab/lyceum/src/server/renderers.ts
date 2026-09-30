import type { FunctionSession, NiscApp } from '@niscorp/moss';
import { RENDERER_REF } from '@lyceum/app/shell/frame.layout';
import { surfaceRenderer } from '@lyceum/app/vex/renderer.entries';
import { vexOver } from './vex-over';

// WHICH RENDERER DRAWS A SCREEN — not an action on it. The frame carries a
// `{ ref }` for it (app/shell/frame.layout.ts); this sets what that ref draws,
// a `Look` naming dom, react or vue, on every living shell, from the
// `renderers` row of the shell's surface. The browser reads it off the frame
// and draws the screen with that renderer (src/ui/target.ts).
//
// A shell's surface is who it is: the speaker's is the controller, the stage's
// is the projector, everybody else's a phone. Read as each shell's own
// principal, over its own wire — once when it is built, and again whenever the
// speaker writes the row (the reaction below).

const surfaceOf = (roles: readonly string[]): string => (roles.includes('speaker') ? 'controller' : roles.includes('stage') ? 'stage' : 'phones');

export const followRenderers = (): { onSession: NonNullable<NiscApp['onSession']>; reaction: NonNullable<NiscApp['reactions']>[number] } => {
  const living = new Set<FunctionSession>();

  // A disposed shell has no canvases left (nova clears them); a living one
  // always has some. Nothing tells a session its shell is gone, so this asks.
  const gone = (session: FunctionSession): boolean => Object.keys(session.shell.getState().canvases).length === 0;

  const paint = async (session: FunctionSession): Promise<void> => {
    if (gone(session)) {
      living.delete(session);
      return;
    }
    const answer: unknown = await vexOver(session.wire)(surfaceRenderer.fingerprint, { surface: surfaceOf(session.roles) });
    const look = typeof answer === 'object' && answer !== null ? Reflect.get(answer, 'renderer') : undefined;
    session.shell.setLayout(RENDERER_REF, { component: 'Look', props: { look: typeof look === 'string' ? look : 'dom' } });
  };
  const paintAll = (): void => {
    for (const session of living) void paint(session).catch(() => living.delete(session));
  };

  return {
    // Before the shell exists, like every `onSession`: the first paint waits
    // for it to finish building.
    onSession: (session) => {
      living.add(session);
      setTimeout(() => void paint(session).catch(() => living.delete(session)), 0);
    },
    reaction: { table: 'renderers', run: paintAll },
  };
};
