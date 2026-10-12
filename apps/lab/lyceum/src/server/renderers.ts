import type { FunctionSession, NiscApp } from '@niscorp/moss';
import { RENDERER_REF } from '@lyceum/app/shell/frame.layout';
import { surfaceRenderer } from '@lyceum/app/vex/renderer.entries';
import { vexOver } from './vex-over';
import { unverifiedShell } from '@niscorp/moss/unverified';

const surfaceOf = (roles: readonly string[]): string => (roles.includes('speaker') ? 'controller' : roles.includes('stage') ? 'stage' : 'phones');

export const followRenderers = (): { onSession: NonNullable<NiscApp['onSession']>; reaction: NonNullable<NiscApp['reactions']>[number] } => {
  const living = new Set<FunctionSession>();

  // Nothing tells a session its shell is gone, so this asks: a disposed shell
  // has no canvases left, a living one always has some.
  const gone = (session: FunctionSession): boolean => Object.keys(session.shell.getState().canvases).length === 0;

  const paint = async (session: FunctionSession): Promise<void> => {
    if (gone(session)) {
      living.delete(session);
      return;
    }
    const answer: unknown = await vexOver(session.wire)(surfaceRenderer.fingerprint, { surface: surfaceOf(session.roles) });
    const look = typeof answer === 'object' && answer !== null ? Reflect.get(answer, 'renderer') : undefined;
    unverifiedShell(session).setLayout(RENDERER_REF, { component: 'Look', props: { look: typeof look === 'string' ? look : 'dom' } });
  };
  const paintAll = (): void => {
    for (const session of living) void paint(session).catch(() => living.delete(session));
  };

  return {
    // `onSession` runs before the shell exists: the first paint waits for it to
    // finish building.
    onSession: (session) => {
      living.add(session);
      setTimeout(() => void paint(session).catch(() => living.delete(session)), 0);
    },
    reaction: { table: 'renderers', run: paintAll },
  };
};
