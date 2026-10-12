import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteAction } from '@relay/app/actions/shared/confirm-delete.action';
import { sidebarAction } from '@relay/app/actions/chrome/sidebar.action';
import { topbarAction } from '@relay/app/actions/chrome/topbar.action';
import { homeAction } from '@relay/app/actions/surfaces/home/home.action';
import { settingsAction } from '@relay/app/actions/surfaces/settings/settings.action';
import { placeholderAction } from '@relay/app/actions/surfaces/placeholder/placeholder.action';
import { assistantAction } from '@relay/app/actions/surfaces/assistant/assistant.action';
import { loginAction } from '@relay/app/actions/surfaces/auth/login.action';
import { dealsAction, dealAction, dealFormAction } from '@relay/app/actions/domains/deal';
import { contactsAction, contactAction, contactFormAction } from '@relay/app/actions/domains/contact';
import { companiesAction, companyAction, companyFormAction } from '@relay/app/actions/domains/company';
import { tasksAction, taskFormAction } from '@relay/app/actions/domains/task';
import { devtoolsActions } from '@niscorp/nova/devtools';

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
    contactsAction, contactAction, contactFormAction,
    companiesAction, companyAction, companyFormAction,
    dealsAction, dealAction, dealFormAction,
    tasksAction, taskFormAction,
  ].map((a) => [a.id, a]),
);

// Separate from ACTIONS so agent knowledge derives from the app's actions
// alone, without the devtools.
export const CATALOG_DEFINITIONS: Record<string, ActionDefinition> = {
  ...ACTIONS,
  ...devtoolsActions,
};
