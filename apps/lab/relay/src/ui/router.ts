import type { Shell } from '@niscorp/nova';
import { SCREEN_PATH, VIEW_PATH, SEGMENT } from '../nova/shell/routes';

// Edge adapter: keeps the address bar and the shell in sync, in memory (no
// reload, no fetch). Nova stays URL-agnostic — this is the only code that
// touches `history`. Two directions:
//   state → URL — observe shell structure changes, pushState the derived path.
//   URL → state — on load + back/forward, drive the shell to match.
//
// The route table it reads (shell/routes.ts) is pure data. The URL tracks the
// main stack's ROOT screen; drilling into records pushes onto main but keeps the
// screen-level URL (deep-linking a drilled record is a later pass).

// The ROOT of a canvas's stack (the screen), regardless of how deep you've
// drilled. The URL tracks the screen, not the drill depth (deep-linking a drilled
// record is a later router pass).
const rootOf = (shell: Shell, canvasId: string): { action: string; view: unknown } | undefined => {
  const root = shell.getCanvasState(canvasId).stack[0];
  return root === undefined ? undefined : { action: root.definitionId, view: root.data['view'] };
};

export const installRouter = (shell: Shell): (() => void) => {
  let applying = false; // suppress state→URL while we drive state from a URL

  // The path the current shell state should show: the main stack's ROOT screen
  // (drilling into records pushes onto main but keeps the screen-level URL).
  const pathFromState = (): string => {
    const root = rootOf(shell, 'main');
    if (root === undefined) return '/';
    // A view-specific path wins (deals board → /pipeline), else the screen home.
    const viewPath = typeof root.view === 'string' ? VIEW_PATH[`${root.action}:${root.view}`] : undefined;
    return viewPath ?? SCREEN_PATH[root.action] ?? '/';
  };

  // Drive the shell from a path: reset `main` to the screen root (clearing any
  // drill stack), seeding the deals view when the route carries one. Publishes
  // `screen-*` so the sidebar highlight + topbar title follow. Deep-linking a
  // drilled record is a later pass; the URL is screen-level for now.
  const applyPath = (path: string): void => {
    applying = true;
    try {
      const parts = path.split('/').filter((p) => p !== '');
      const route = SEGMENT[parts[0] ?? ''] ?? SEGMENT[''];
      const screen = route?.screen ?? 'home';

      const root = rootOf(shell, 'main');
      const viewChanged = route?.view !== undefined && root?.view !== route.view;
      if (root?.action !== screen || viewChanged) {
        shell.clear('main');
        // The shell only holds the principal's catalog — a deep link to an
        // ungranted screen throws UnknownActionError. Fall back down the
        // chain: home, then the lock screen; a bare canvas is the floor.
        for (const candidate of [screen, 'home', 'auth.login']) {
          try {
            shell.push('main', candidate, candidate === screen && route?.view !== undefined ? { view: route.view } : undefined);
            if (candidate === screen) shell.publish(route?.channel ?? `screen-${screen}`);
            else if (candidate === 'home') shell.publish('screen-home');
            return;
          } catch {
            /* not granted — try the next */
          }
        }
        return;
      }
      shell.publish(route?.channel ?? `screen-${screen}`);
    } finally {
      applying = false;
    }
  };

  // state → URL
  const unsub = shell.onStateChange(() => {
    if (applying) return;
    const next = pathFromState();
    if (next !== window.location.pathname) window.history.pushState({}, '', next);
  });

  // URL → state (browser back/forward)
  const onPop = (): void => applyPath(window.location.pathname);
  window.addEventListener('popstate', onPop);

  // Adopt the URL the app loaded with.
  applyPath(window.location.pathname);

  return () => {
    unsub();
    window.removeEventListener('popstate', onPop);
  };
};
