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

export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [topbarAction, confirmDeleteAction, todosAction, todoFormAction].map((a) => [a.id, a]),
);

export const shell = createShell({
  canvases: [
    { id: 'topbar', initial: 'topbar' },
    { id: 'main', initial: 'todos' },
    { id: 'modal' },
  ],
  canvasLayout: frameLayout,
  actions: ACTIONS,
  fragments: { modal: modalFragment },
  registry: buildRegistry(),
  transform: (config, source) =>
    evaluate(
      config as Parameters<typeof evaluate>[0],
      (source !== null && typeof source === 'object' && !Array.isArray(source)
        ? { ...(source as Record<string, unknown>), today: CURRENT_DATE }
        : source) as Parameters<typeof evaluate>[1],
    ),
  fetch: fableFetch,
});

// Vite HMR cannot rebuild a module singleton, so an edit to this module or
// anything it imports would render against the stale shell: reload instead.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload();
  });
}
