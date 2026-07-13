import { createShell, type ActionDefinition } from '@niscorp/nova';
import { evaluate } from '@niscorp/prism';
import { buildRegistry } from '../../ui';
import { fableFetch } from '../../vex/http';
import { CURRENT_DATE } from '@fable/vex/runtime';
import { frameLayout } from './frame.layout';
import { topbarAction } from '../chrome/topbar.action';
import { confirmDeleteAction } from '../shared/confirm-delete.action';
import { todosAction, todoFormAction } from '../domains/todo';
import { modalFragment } from '../fragments/modal.fragment';

// Everything the shell can show, by id. Each is a literal, serializable
// ActionDefinition (layout included).
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [topbarAction, confirmDeleteAction, todosAction, todoFormAction].map((a) => [a.id, a]),
);

// The Fable shell. `frameLayout` is fixed chrome; `modal` starts empty (its
// CanvasSlot renders nothing until something is pushed). Everything visible
// is an action; React only mounts <NovaShell> against this.
export const shell = createShell({
  canvases: [
    { id: 'topbar', initial: 'topbar' },
    { id: 'main', initial: 'todos' },
    { id: 'modal' },
  ],
  canvasLayout: frameLayout,
  actions: ACTIONS,
  // Reusable dialog chrome, composed into a concrete action at a push `with`.
  fragments: { modal: modalFragment },
  registry: buildRegistry(),
  // The injected Prism evaluator runs endpoint `request`/`response` transforms
  // (request over the action data; response over the reply). Endpoint-only —
  // never touches an action's own data. We fold in the app's "today" as
  // ambient context so read prisms resolve `$.today` (rule 6); harmless on
  // the `{ result }` response source.
  transform: (config, source) =>
    evaluate(
      config as Parameters<typeof evaluate>[0],
      (source !== null && typeof source === 'object' && !Array.isArray(source)
        ? { ...(source as Record<string, unknown>), today: CURRENT_DATE }
        : source) as Parameters<typeof evaluate>[1],
    ),
  // In-browser API: /api/todos/* URLs hit the in-process engine + write
  // handlers; everything else is a real fetch.
  fetch: fableFetch,
});

// Dev only: this shell is built once, here. Vite HMR can't rebuild a module
// singleton, so edits to the canvasLayout / actions / layouts would otherwise
// render against a STALE shell. Force a clean full reload whenever this
// module — or anything it imports (every layout and action) — changes.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
