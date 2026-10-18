import { dealsInputSchema } from '@relay/app/actions/domains/deal/deals.action';
import { dealInputSchema } from '@relay/app/actions/domains/deal/deal.action';
import { dealFormInputSchema } from '@relay/app/actions/domains/deal/deal.form.action';
import { contactsInputSchema } from '@relay/app/actions/domains/contact/contacts.action';
import { contactInputSchema } from '@relay/app/actions/domains/contact/contact.action';
import { contactFormInputSchema } from '@relay/app/actions/domains/contact/contact.form.action';
import { companiesInputSchema } from '@relay/app/actions/domains/company/companies.action';
import { companyInputSchema } from '@relay/app/actions/domains/company/company.action';
import { companyFormInputSchema } from '@relay/app/actions/domains/company/company.form.action';
import { tasksInputSchema } from '@relay/app/actions/domains/task/tasks.action';
import { taskFormInputSchema } from '@relay/app/actions/domains/task/task.form.action';
import { homeInputSchema } from '@relay/app/actions/surfaces/home/home.action';
import { settingsInputSchema } from '@relay/app/actions/surfaces/settings/settings.action';

export type CatalogEntry = { id: string; description: string; input: Record<string, unknown> };

// The screens the app ships that the assistant may place. The ones a session built or kept are the session's own list.
const SHIPPED: readonly CatalogEntry[] = [
  { id: 'home', description: 'Dashboard.', input: homeInputSchema },
  { id: 'crm.deals', description: 'Deals — table or pipeline board.', input: dealsInputSchema },
  { id: 'crm.contacts', description: 'Contacts list.', input: contactsInputSchema },
  { id: 'crm.companies', description: 'Companies list.', input: companiesInputSchema },
  { id: 'tasks.manage', description: 'Tasks.', input: tasksInputSchema },
  { id: 'settings', description: 'Workspace settings.', input: settingsInputSchema },
  { id: 'crm.deal.view', description: 'A deal.', input: dealInputSchema },
  { id: 'crm.contact.view', description: 'A contact.', input: contactInputSchema },
  { id: 'crm.company.view', description: 'A company.', input: companyInputSchema },
  { id: 'crm.deal.form', description: 'Form to create or edit a deal; the user submits it.', input: dealFormInputSchema },
  { id: 'crm.contact.form', description: 'Form to create or edit a contact; the user submits it.', input: contactFormInputSchema },
  { id: 'crm.company.form', description: 'Form to create or edit a company; the user submits it.', input: companyFormInputSchema },
  { id: 'tasks.form', description: 'Form to create or edit a task; the user submits it.', input: taskFormInputSchema },
];

const IDS: ReadonlySet<string> = new Set(SHIPPED.map((entry) => entry.id));

export const catalogEntries = (): ReadonlyArray<CatalogEntry> => SHIPPED;
export const catalogIds = (): ReadonlySet<string> => IDS;

export const VIZ_COMPONENTS = ['Box', 'Stack', 'Row', 'Grid', 'Text', 'Badge', 'Avatar', 'Icon', 'Table'];

export const VIZ_OMIT_PROPS = ['bg', 'border', 'radius', 'glow', 'pad', 'px', 'py', 'width', 'h'];
