import { createShell, type ActionDefinition } from '@niscorp/nova';
import { buildRegistry } from '../../ui';
import { frameLayout } from './frame.layout';
import { mainSplitLayout } from './main-split.layout';
import { queries, mutations } from './functions';
import { MUTATIONS } from '../../api';
import { deleteMutations } from '../shared/confirm-delete.prism';
import { confirmDeleteAction } from '../shared/confirm-delete.action';
import { sidebarPrism } from '../chrome/sidebar.prism';
import { topbarPrism } from '../chrome/topbar.prism';
import { sidebarAction } from '../chrome/sidebar.action';
import { topbarAction } from '../chrome/topbar.action';
import { homePrism } from '../surfaces/home/home.prism';
import { homeAction } from '../surfaces/home/home.action';
import { settingsAction } from '../surfaces/settings/settings.action';
import { placeholderAction } from '../surfaces/placeholder/placeholder.action';
// Domains — one barrel each: the actions + their read/write prism seams.
import {
  dealsAction, dealAction, dealFormAction,
  dealsReads, dealsMutations, dealReads, dealMutations, dealFormReads, dealFormMutations,
} from '../domains/deal';
import {
  contactsAction, contactAction, contactFormAction,
  contactsReads, contactReads, contactFormMutations,
} from '../domains/contact';
import {
  companiesAction, companyAction, companyFormAction,
  companiesReads, companyReads, companyFormMutations,
} from '../domains/company';
import {
  tasksAction, taskFormAction,
  tasksReads, tasksMutations, taskFormMutations,
} from '../domains/task';
import { modalFragment } from '../fragments/modal.fragment';
import { quickviewFragment } from '../fragments/quickview.fragment';

// Every screen the shell can show, by id. Each is a literal, serializable
// ActionDefinition (layout included) — DB-ready.
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    sidebarAction,
    topbarAction,
    homeAction,
    settingsAction,
    confirmDeleteAction,
    placeholderAction,
    // Entities
    contactsAction, contactAction, contactFormAction,
    companiesAction, companyAction, companyFormAction,
    dealsAction, dealAction, dealFormAction,
    tasksAction, taskFormAction,
  ].map((a) => [a.id, a]),
);

// The Relay shell. The `frameLayout` is fixed chrome that places sidebar /
// topbar and leaves `main` + `modal` as LayoutRefs. `detail` and `modal` start
// empty (their CanvasSlots render nothing until something is pushed). Everything
// visible is an action; React only mounts <NovaShell> against this.
export const shell = createShell({
  canvases: [
    { id: 'sidebar', initial: 'sidebar' },
    { id: 'topbar', initial: 'topbar' },
    { id: 'main', initial: 'home' },
    { id: 'detail' },
    { id: 'modal' },
  ],
  canvasLayout: frameLayout,
  actions: ACTIONS,
  // Reusable partial actions, composed into a concrete action at a push `with`.
  // `modal` wraps a pushed action in dialog chrome (see modal.fragment.ts).
  fragments: { modal: modalFragment, quickview: quickviewFragment },
  // The shell assembly: each screen's `.prism.ts` read seam becomes one reader
  // per `fn` id, and each `/api` mutation becomes one writer per `fn` id. Both
  // are `FunctionHandler`s — Nova calls them the same way; the id namespace
  // (`contacts.list` vs `contact.create`) keeps reads and writes apart.
  functions: {
    ...queries({
      ...sidebarPrism,
      ...topbarPrism,
      ...homePrism,
      ...contactsReads,
      ...contactReads,
      ...companiesReads,
      ...companyReads,
      ...dealsReads,
      ...dealReads,
      ...dealFormReads,
      ...tasksReads,
    }),
    ...mutations(
      {
        ...contactFormMutations,
        ...companyFormMutations,
        ...taskFormMutations,
        ...dealFormMutations,
        ...dealsMutations,
        ...dealMutations,
        ...deleteMutations,
        ...tasksMutations,
      },
      MUTATIONS,
    ),
  },
  registry: buildRegistry(),
});

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
