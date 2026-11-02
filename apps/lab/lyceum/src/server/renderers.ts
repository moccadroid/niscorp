import type { FunctionSession, NiscApp } from '@niscorp/moss';
import { RENDERER_REF } from '@lyceum/app/shell/frame.layout';
import { myRenderer, surfaceRenderer } from '@lyceum/app/vex/renderer.entries';
import { vexOver } from './vex-over';
import { unverifiedShell } from '@niscorp/moss/unverified';

const surfaceOf = (roles: readonly string[]): string => (roles.includes('speaker') ? 'controller' : roles.includes('stage') ? 'stage' : 'phones');

const rendererOf = (answer: unknown): string | undefined => {
  const row = Array.isArray(answer) ? answer[0] : answer;
  const renderer = typeof row === 'object' && row !== null ? Reflect.get(row, 'renderer') : undefined;
  return typeof renderer === 'string' && renderer !== '' ? renderer : undefined;
};

export const followRenderers = (): { onSession: NonNullable<NiscApp['onSession']>; reactions: NonNullable<NiscApp['reactions']> } => {
  const living = new Set<FunctionSession>();

  // Nothing tells a session its shell is gone, so this asks: a disposed shell
  // has no canvases left, a living one always has some.
  const gone = (session: FunctionSession): boolean => Object.keys(session.shell.getState().canvases).length === 0;

  // A member who picked a renderer for their own phone gets it; anybody else gets their surface's.
  const lookOf = async (session: FunctionSession): Promise<string> => {
    const ask = vexOver(session.wire);
    if (session.roles.includes('member')) {
      const mine = rendererOf(await ask(myRenderer.fingerprint).catch(() => undefined));
      if (mine !== undefined) return mine;
    }
    return rendererOf(await ask(surfaceRenderer.fingerprint, { surface: surfaceOf(session.roles) })) ?? 'dom';
  };

  const paint = async (session: FunctionSession): Promise<void> => {
    if (gone(session)) {
      living.delete(session);
      return;
    }
    unverifiedShell(session).setLayout(RENDERER_REF, { component: 'Look', props: { look: await lookOf(session) } });
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
    reactions: [
      { table: 'renderers', run: paintAll },
      { table: 'member_renderers', run: paintAll },
    ],
  };
};
