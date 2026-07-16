import { createShell, type Shell } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import { buildRegistry } from '../../ui';
import { vexFetch, unwrapResult } from '../../vex/http';
import { traceFetch } from '../../nova-devtools/core/trace-fetch';
import { devtoolsFunctions } from '../../nova-devtools/core/fns';
import { installNovaDevtools } from '../../nova-devtools/core/install';
import { todayStr } from '@relay/vex/runtime';
import { authFunctions, type Identity } from '../../auth';
import { CHARTER, ASSIGNMENTS, rolesOf, resolvePrincipal, verifyCharter } from '../../charter';
import { TABLES } from '../../vex/scope';
import { frameLayout } from './frame.layout';
import { mainSplitLayout } from './main-split.layout';
import { mainStackLayout, asideStackLayout } from './stack-nav.layout';
import { keysLoad, keysSave } from '../../llm/keys';
import { rayRun, raySetKey, rayLoad, rayNewSession, raySwitchSession, bindShell, getDebug, setDebug, clearAll, storageEstimate } from '../../ray';
import { ACTIONS, CATALOG_DEFINITIONS } from './actions';
import { modalFragment } from '../fragments/modal.fragment';
import { quickviewFragment } from '../fragments/quickview.fragment';
import { panelFragment } from '../fragments/panel.fragment';
import { dockFragment } from '../fragments/dock.fragment';

export { ACTIONS, CATALOG_DEFINITIONS } from './actions';

// The Relay shell, built PER PRINCIPAL. The charter resolves the signed-in
// identity's roles to a catalog; only those definitions reach createShell —
// an ungranted action is not hidden, it does not exist (a push throws
// UnknownActionError). Signing in or out rebuilds the shell (app.tsx); the
// anonymous principal's whole application is `auth.login`, the lock screen.
export class CharterBootError extends Error {}

const pick = (ids: ReadonlySet<string>): Record<string, (typeof ACTIONS)[string]> =>
  Object.fromEntries(Object.entries(ACTIONS).filter(([id]) => ids.has(id)));

export const buildShell = (who: Identity | null): Shell => {
  // Boot refusal: an incoherent charter never serves a catalog.
  const report = verifyCharter(CHARTER, CATALOG_DEFINITIONS, TABLES, ASSIGNMENTS);
  if (report.errors.length > 0) {
    throw new CharterBootError(`Charter is incoherent:\n${report.errors.map((e) => `  ${e.rule}: ${e.detail}`).join('\n')}`);
  }

  const roles = rolesOf(who?.userId ?? null);
  const ids = resolvePrincipal(CHARTER, Object.keys(CATALOG_DEFINITIONS), roles);
  const userId = who?.userId ?? 'anonymous';

  // The sidebar renders only granted screens — boot input, not a variant.
  const nav = {
    home: ids.has('home'),
    tasks: ids.has('tasks.manage'),
    pipeline: ids.has('crm.deals'),
    contacts: ids.has('crm.contacts'),
    companies: ids.has('crm.companies'),
    deals: ids.has('crm.deals'),
    settings: ids.has('settings'),
  };
  const user = { name: who?.name ?? '', roles: roles.join(' · ') };

  const shell = createShell({
    canvases: [
      // Chrome mounts only when granted; `main` boots to home, or to the lock
      // screen when home isn't in the catalog (the anonymous principal).
      { id: 'sidebar', ...(ids.has('chrome.sidebar') ? { initial: { action: 'chrome.sidebar', input: { nav, user } } } : {}) },
      // The palette shows the granted catalog, not the whole actions table —
      // the resolved action ids are handed in as the search's allow-list.
      { id: 'topbar', ...(ids.has('chrome.topbar') ? { initial: { action: 'chrome.topbar', input: { allowedIds: [...ids] } } } : {}) },
      {
        id: 'main',
        actionLayout: mainStackLayout,
        ...(ids.has('home') ? { initial: 'home' } : ids.has('auth.login') ? { initial: 'auth.login' } : {}),
      },
      { id: 'aside', actionLayout: asideStackLayout },
      { id: 'modal' },
    ],
    canvasLayout: frameLayout,
    actions: pick(ids),
    // Reusable partial actions, composed into a concrete action at a push `with`.
    fragments: { modal: modalFragment, quickview: quickviewFragment, panel: panelFragment, dock: dockFragment },
    // Reads AND writes are declarative HTTP endpoints; the only `fn`s are
    // Ray's, the devtools', and sign-in (genuinely local, not data access).
    functions: {
      'ray.run': rayRun,
      'ray.setKey': raySetKey,
      'keys.load': keysLoad,
      'keys.save': keysSave,
      'ray.load': rayLoad,
      'ray.newSession': rayNewSession,
      'ray.switch': raySwitchSession,
      'ray.getDebug': async () => getDebug(),
      'ray.setDebug': async (d) => {
        setDebug(Boolean((d as { rayDebug?: unknown }).rayDebug));
        return getDebug();
      },
      'ray.clearSessions': async () => {
        clearAll();
        return true;
      },
      'ray.storageSize': async () => storageEstimate(),
      // Sign-in — username → fake magic link → token (see src/auth).
      ...authFunctions,
      ...devtoolsFunctions,
    },
    registry: buildRegistry(),
    // The injected Prism evaluator runs endpoint `request`/`response`
    // transforms. `$.userId` comes from the TOKEN the shell was built for and
    // `$.today` from the wall clock — folded in as ambient context, never
    // authorable by a request.
    transform: (config, source) =>
      evaluate(
        config as Parameters<typeof evaluate>[0],
        (source !== null && typeof source === 'object' && !Array.isArray(source)
          ? { ...(source as Record<string, unknown>), userId, today: todayStr() }
          : source) as Parameters<typeof evaluate>[1],
      ),
    // Unwrap sits OUTSIDE the trace tee: the timeline sees vex's full
    // `{ result, meta }` envelope; actions receive `result` itself.
    fetch: unwrapResult(traceFetch(vexFetch)),
  });

  // Ray's tools/run reach the current shell through the bridge.
  bindShell(shell);

  // Devtools are charter-granted like everything else (`dev` role) — the
  // install registers their actions, so it runs only when granted.
  if (ids.has('devtools.dock')) installNovaDevtools(shell);

  // Seed the targets of the frame's LayoutRefs.
  shell.layoutStore.set('main', mainSplitLayout);
  shell.layoutStore.set('modal', { component: 'CanvasSlot', props: { canvasId: 'modal' } });

  return shell;
};

// Dev only: Vite HMR can't rebuild shells already handed to React — force a
// clean reload when this module (or anything it imports) changes.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
