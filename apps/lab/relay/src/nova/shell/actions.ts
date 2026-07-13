import type { ActionDefinition } from '@niscorp/nova';
import { confirmDeleteAction } from '../shared/confirm-delete.action';
import { keysAction } from '../shared/keys.action';
import { sidebarAction } from '../chrome/sidebar.action';
import { topbarAction } from '../chrome/topbar.action';
import { homeAction } from '../surfaces/home/home.action';
import { settingsAction } from '../surfaces/settings/settings.action';
import { placeholderAction } from '../surfaces/placeholder/placeholder.action';
import { assistantAction } from '../surfaces/assistant/assistant.action';
// Domains — one barrel each: the actions + their read/write prism seams.
import { dealsAction, dealAction, dealFormAction } from '../domains/deal';
import { contactsAction, contactAction, contactFormAction } from '../domains/contact';
import { companiesAction, companyAction, companyFormAction } from '../domains/company';
import { tasksAction, taskFormAction } from '../domains/task';

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
    keysAction,
    placeholderAction,
    assistantAction,
    // Entities
    contactsAction, contactAction, contactFormAction,
    companiesAction, companyAction, companyFormAction,
    dealsAction, dealAction, dealFormAction,
    tasksAction, taskFormAction,
  ].map((a) => [a.id, a]),
);
