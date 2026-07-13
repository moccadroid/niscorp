import { createShell } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import { buildRegistry } from '../../ui';
import { vexFetch } from '../../vex/http';
import { traceFetch } from '../../nova-devtools/core/trace-fetch';
import { devtoolsFunctions } from '../../nova-devtools/core/fns';
import { installNovaDevtools } from '../../nova-devtools/core/install';
import { CURRENT_USER_ID, CURRENT_DATE } from '@relay/vex/runtime';
import { frameLayout } from './frame.layout';
import { mainSplitLayout } from './main-split.layout';
import { mainStackLayout, asideStackLayout } from './stack-nav.layout';
import { keysLoad, keysSave } from '../../llm/keys';
import { rayRun, raySetKey, rayLoad, rayNewSession, raySwitchSession, bindShell, getDebug, setDebug, clearAll, storageEstimate } from '../../ray';
import { ACTIONS } from './actions';
import { modalFragment } from '../fragments/modal.fragment';
import { quickviewFragment } from '../fragments/quickview.fragment';
import { panelFragment } from '../fragments/panel.fragment';
import { dockFragment } from '../fragments/dock.fragment';

export { ACTIONS } from './actions';

// The Relay shell. The `frameLayout` is fixed chrome that places sidebar /
// topbar and leaves `main` + `modal` as LayoutRefs. `aside` and `modal` start
// empty (their CanvasSlots render nothing until something is pushed). Everything
// visible is an action; React only mounts <NovaShell> against this.
export const shell = createShell({
  canvases: [
    { id: 'sidebar', initial: 'sidebar' },
    { id: 'topbar', initial: 'topbar' },
    // main + aside get the per-canvas stack nav (back + breadcrumb trail);
    // modal stays a single card (chrome from the panel/modal fragment).
    { id: 'main', initial: 'home', actionLayout: mainStackLayout },
    { id: 'aside', actionLayout: asideStackLayout },
    { id: 'modal' },
  ],
  canvasLayout: frameLayout,
  actions: ACTIONS,
  // Reusable partial actions, composed into a concrete action at a push `with`.
  // `modal` wraps a pushed action in dialog chrome (see modal.fragment.ts).
  fragments: { modal: modalFragment, quickview: quickviewFragment, panel: panelFragment, dock: dockFragment },
  // The shell assembly: both reads AND writes are declarative HTTP endpoints now
  // (each screen's `.prism.ts` seam is imported into its action as the endpoint's
  // `request`, served by `vexFetch` → Vex's resource handler). The only `fn`s left
  // are Ray's — genuinely local functions, not data access.
  functions: {
    // Ray — the assistant agent, exposed as plain Nova functions the chat surface
    // calls. `ray.run` runs the Cortex agent; `ray.setKey` stores the Groq key.
    'ray.run': rayRun,
    'ray.setKey': raySetKey,
    // The API-keys modal (keys.action.ts): load current keys, save both.
    'keys.load': keysLoad,
    'keys.save': keysSave,
    'ray.load': rayLoad,
    'ray.newSession': rayNewSession,
    'ray.switch': raySwitchSession,
    // Ray's debug toggle (browser-local). getDebug → the switch's initial state;
    // setDebug persists a change. run.ts reads the same flag to capture a trace.
    'ray.getDebug': async () => getDebug(),
    'ray.setDebug': async (d) => {
      setDebug(Boolean((d as { rayDebug?: unknown }).rayDebug));
      return getDebug();
    },
    // Clear every saved chat session; report Ray's localStorage footprint.
    'ray.clearSessions': async () => {
      clearAll();
      return true;
    },
    'ray.storageSize': async () => storageEstimate(),
    // Nova-devtools fns — the dock/inspector actions' `fn:` endpoints (pull the
    // trace buffer, snapshot the shell, audit the registry, describe an
    // instance). Genuinely local functions, same category as Ray's.
    ...devtoolsFunctions,
  },
  registry: buildRegistry(),
  // The injected Prism evaluator runs endpoint `request`/`response` transforms
  // (request over the action data; response over the reply wrapped as
  // `{ result: <reply> }`). Endpoint-only — never touches an action's own data.
  // We fold in the signed-in user (`$.userId`) and the app's "today" (`$.today`)
  // as ambient context so read prisms resolve them — exactly what the old `query`
  // reader injected. Harmless on the `{ result }` response source.
  transform: (config, source) =>
    evaluate(
      config as Parameters<typeof evaluate>[0],
      (source !== null && typeof source === 'object' && !Array.isArray(source)
        ? { ...(source as Record<string, unknown>), userId: CURRENT_USER_ID, today: CURRENT_DATE }
        : source) as Parameters<typeof evaluate>[1],
    ),
  // In-browser Vex-as-HTTP: `/vex` URLs hit the in-process engine via Vex's own
  // handler; everything else is a real fetch. `traceFetch` tees each call into
  // the devtools timeline while the devtools flag is on; off-flag it's a
  // passthrough.
  fetch: traceFetch(vexFetch),
});

// Let Ray's tools/run reach this shell (registered into it, so they can't import
// it — see ray/bridge.ts).
bindShell(shell);

// Nova-devtools: registers the dock/inspector actions, adds the `devtools`
// canvas, attaches the telemetry taps, and syncs the canvas with the debug
// flag (Cmd/Ctrl+Shift+D). Same bridge pattern as Ray.
installNovaDevtools(shell);

// Seed the targets of the frame's LayoutRefs. `main` → the master/detail split;
// `modal` → a bare overlay slot (empty until a modal action is pushed). These
// are what the LLM/agent hot-swaps later via shell.setLayout(ref, …).
shell.layoutStore.set('main', mainSplitLayout);
shell.layoutStore.set('modal', { component: 'CanvasSlot', props: { canvasId: 'modal' } });

// Dev only: this shell is built once, here. Vite HMR can't rebuild a module
// singleton, so edits to the canvasLayout / actions / layouts would otherwise
// render against a STALE shell (the "padding shows for a second then reverts"
// bug). Force a clean full reload whenever this module — or anything it
// imports (every layout and action) — changes.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
