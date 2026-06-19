import type { Shell } from '@niscorp/nova';
import { SCREEN_PATH, DETAIL_SEGMENT, SEGMENT } from '../nova/routes';

// Edge adapter: keeps the address bar and the shell in sync, in memory (no
// reload, no fetch). Nova stays URL-agnostic — this is the only code that
// touches `history`. Two directions:
//   state → URL — observe shell structure changes, pushState the derived path.
//   URL → state — on load + back/forward, drive the shell to match.
//
// The route table it reads (nova/routes.ts) is pure data.

const activeOf = (shell: Shell, canvasId: string): { action: string; id: unknown } | undefined => {
  const active = shell.getCanvasState(canvasId).active;
  if (active === undefined) return undefined;
  const rt = shell.getRuntime(active.id);
  if (rt === undefined) return undefined;
  return { action: rt.definition.id, id: rt.getData()['id'] };
};

export const installRouter = (shell: Shell): (() => void) => {
  let applying = false; // suppress state→URL while we drive state from a URL

  // The path the current shell state should show: an open detail wins (a record
  // is canonical), else the main screen.
  const pathFromState = (): string => {
    const detail = activeOf(shell, 'detail');
    if (detail !== undefined) {
      const seg = DETAIL_SEGMENT[detail.action];
      if (seg !== undefined && typeof detail.id === 'string' && detail.id !== '') {
        return `/${seg}/${detail.id}`;
      }
    }
    const main = activeOf(shell, 'main');
    return (main !== undefined ? SCREEN_PATH[main.action] : undefined) ?? '/';
  };

  // Drive the shell from a path. Publishes `screen-*` so the sidebar highlight +
  // topbar title follow (the same channel a nav click emits). Guards avoid
  // remounting a screen/detail that's already showing.
  const applyPath = (path: string): void => {
    applying = true;
    try {
      const parts = path.split('/').filter((p) => p !== '');
      const route = SEGMENT[parts[0] ?? ''] ?? SEGMENT[''];
      const screen = route?.screen ?? 'home';
      const recordId = parts[1];
      const opensDetail = recordId !== undefined && route?.detail !== undefined;

      // Switching the main list with a record open seeds the list's
      // `highlight_id` so the matching row is marked.
      const main = activeOf(shell, 'main');
      if (main?.action !== screen) {
        shell.replace('main', screen, opensDetail ? { highlight_id: recordId } : undefined);
      }
      shell.publish(`screen-${screen}`);

      const detail = activeOf(shell, 'detail');
      if (opensDetail) {
        if (detail?.action !== route?.detail || detail?.id !== recordId) {
          shell.replace('detail', route!.detail!, { id: recordId });
        }
      } else if (detail !== undefined) {
        shell.publish('deselect'); // back-to-list clears the row highlight
        shell.clear('detail');
      }
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
