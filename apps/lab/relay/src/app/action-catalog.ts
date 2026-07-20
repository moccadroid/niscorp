import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteAction } from '@relay/app/actions/shared/confirm-delete.action';
import { sidebarAction } from '@relay/app/actions/chrome/sidebar.action';
import { topbarAction } from '@relay/app/actions/chrome/topbar.action';
import { homeAction } from '@relay/app/actions/surfaces/home/home.action';
import { settingsAction } from '@relay/app/actions/surfaces/settings/settings.action';
import { placeholderAction } from '@relay/app/actions/surfaces/placeholder/placeholder.action';
import { assistantAction } from '@relay/app/actions/surfaces/assistant/assistant.action';
import { loginAction } from '@relay/app/actions/surfaces/auth/login.action';
// Domains — one barrel each: the actions + their read/write prism seams.
import { dealsAction, dealAction, dealFormAction } from '@relay/app/actions/domains/deal';
import { contactsAction, contactAction, contactFormAction } from '@relay/app/actions/domains/contact';
import { companiesAction, companyAction, companyFormAction } from '@relay/app/actions/domains/company';
import { tasksAction, taskFormAction } from '@relay/app/actions/domains/task';
import { devtoolsActions } from '@niscorp/nova/devtools';

// Every screen the shell can show, by id. Each is a literal, serializable
// ActionDefinition (layout included) — DB-ready. A separate module (not
// shell.ts) so knowledge derivations (message channels, catalogs) can read
// the definitions without importing the shell — shell.ts pulls in Ray, and
// Ray's knowledge pulling in shell.ts would cycle.
export const ACTIONS: Record<string, ActionDefinition> = Object.fromEntries(
  [
    sidebarAction,
    topbarAction,
    homeAction,
    settingsAction,
    confirmDeleteAction,
    placeholderAction,
    assistantAction,
    loginAction,
    // Entities
    contactsAction, contactAction, contactFormAction,
    companiesAction, companyAction, companyFormAction,
    dealsAction, dealAction, dealFormAction,
    tasksAction, taskFormAction,
  ].map((a) => [a.id, a]),
);

// The full definition universe the charter resolves against: the app actions
// plus nova's own devtools (granted only to the `dev` role). Pure nova — the
// dock reads the shell through nova/reflect and renders in any terminal.
// Separate from ACTIONS so agent knowledge keeps deriving from the app surface
// alone.
export const CATALOG_DEFINITIONS: Record<string, ActionDefinition> = {
  ...ACTIONS,
  ...devtoolsActions,
};
