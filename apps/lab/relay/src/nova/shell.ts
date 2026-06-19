import { createShell, type ActionDefinition } from '@niscorp/nova';
import { buildRegistry } from '../ui';
import { frameLayout } from './layouts/shell.layout';
import { mainSplitLayout } from './layouts/main-split.layout';
import { queries, mutations } from './functions';
import { MUTATIONS } from '../api';
import { newContactPrism } from './screens/new-contact/new-contact.prism';
import { newCompanyPrism } from './screens/new-company/new-company.prism';
import { newTaskPrism } from './screens/new-task/new-task.prism';
import { dealsBoardMutations } from './screens/deals-board/deals-board.prism';
import { dealModalMutations } from './screens/deal-modal/deal-modal.prism';
import { newDealReads, newDealMutations } from './screens/new-deal/new-deal.prism';
import { deleteMutations } from './screens/confirm-delete/confirm-delete.prism';
import { sidebarPrism } from './screens/sidebar/sidebar.prism';
import { topbarPrism } from './screens/topbar/topbar.prism';
import { homePrism } from './screens/home/home.prism';
import { contactsPrism } from './screens/contacts/contacts.prism';
import { contactDetailPrism } from './screens/contact-detail/contact-detail.prism';
import { companiesPrism } from './screens/companies/companies.prism';
import { companyDetailPrism } from './screens/company-detail/company-detail.prism';
import { dealsPrism } from './screens/deals/deals.prism';
import { dealsBoardPrism } from './screens/deals-board/deals-board.prism';
import { dealModalPrism } from './screens/deal-modal/deal-modal.prism';
import { tasksPrism, taskMutations } from './screens/tasks/tasks.prism';
import { sidebarAction } from './screens/sidebar/sidebar.action';
import { topbarAction } from './screens/topbar/topbar.action';
import { homeAction } from './screens/home/home.action';
import { contactsAction } from './screens/contacts/contacts.action';
import { contactDetailAction } from './screens/contact-detail/contact-detail.action';
import { companiesAction } from './screens/companies/companies.action';
import { companyDetailAction } from './screens/company-detail/company-detail.action';
import { dealsAction } from './screens/deals/deals.action';
import { dealsBoardAction } from './screens/deals-board/deals-board.action';
import { dealModalAction } from './screens/deal-modal/deal-modal.action';
import { tasksAction } from './screens/tasks/tasks.action';
import { settingsAction } from './screens/settings/settings.action';
import { newContactAction } from './screens/new-contact/new-contact.action';
import { newCompanyAction } from './screens/new-company/new-company.action';
import { newDealAction } from './screens/new-deal/new-deal.action';
import { newTaskAction } from './screens/new-task/new-task.action';
import { editContactAction } from './screens/edit-contact/edit-contact.action';
import { editCompanyAction } from './screens/edit-company/edit-company.action';
import { editDealAction } from './screens/edit-deal/edit-deal.action';
import { confirmDeleteAction } from './screens/confirm-delete/confirm-delete.action';
import { editTaskAction } from './screens/edit-task/edit-task.action';
import { placeholderAction } from './screens/placeholder/placeholder.action';
import { modalFragment } from './fragments/modal.fragment';
import { quickviewFragment } from './fragments/quickview.fragment';

// Every screen the shell can show, by id. Each is a literal, serializable
// ActionDefinition (layout included) — DB-ready.
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    sidebarAction,
    topbarAction,
    homeAction,
    contactsAction,
    contactDetailAction,
    companiesAction,
    companyDetailAction,
    dealsAction,
    dealsBoardAction,
    dealModalAction,
    tasksAction,
    settingsAction,
    newContactAction,
    newCompanyAction,
    newDealAction,
    newTaskAction,
    editContactAction,
    editCompanyAction,
    editDealAction,
    editTaskAction,
    confirmDeleteAction,
    placeholderAction,
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
      ...contactsPrism,
      ...contactDetailPrism,
      ...companiesPrism,
      ...companyDetailPrism,
      ...dealsPrism,
      ...dealsBoardPrism,
      ...dealModalPrism,
      ...tasksPrism,
      ...newDealReads,
    }),
    ...mutations(
      {
        ...newContactPrism,
        ...newCompanyPrism,
        ...newTaskPrism,
        ...newDealMutations,
        ...dealsBoardMutations,
        ...dealModalMutations,
        ...deleteMutations,
        ...taskMutations,
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
