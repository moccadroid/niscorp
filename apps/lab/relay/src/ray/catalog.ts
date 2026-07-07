import { dealsInputSchema } from '@relay/nova/domains/deal/deals.action';
import { dealInputSchema } from '@relay/nova/domains/deal/deal.action';
import { dealFormInputSchema } from '@relay/nova/domains/deal/deal.form.action';
import { contactsInputSchema } from '@relay/nova/domains/contact/contacts.action';
import { contactInputSchema } from '@relay/nova/domains/contact/contact.action';
import { contactFormInputSchema } from '@relay/nova/domains/contact/contact.form.action';
import { companiesInputSchema } from '@relay/nova/domains/company/companies.action';
import { companyInputSchema } from '@relay/nova/domains/company/company.action';
import { companyFormInputSchema } from '@relay/nova/domains/company/company.form.action';
import { tasksInputSchema } from '@relay/nova/domains/task/tasks.action';
import { homeInputSchema } from '@relay/nova/surfaces/home/home.action';
import { settingsInputSchema } from '@relay/nova/surfaces/settings/settings.action';

// ═══════════════════════════════════════════════════════════
// Ray's vocabulary — what it may open, and what it may build views with.
//
// CATALOG: the actions Ray can place + a one-line description of each. The input
// schema is JSON Schema OWNED BY THE ACTION — each `.action.ts` authors it in zod
// and exports the converted schema; here we only curate the openable set + the
// descriptions, so the schema can never drift from the action's real inputs.
// CATALOG_IDS gates which ids Ray may open.
//
// VIZ_COMPONENTS: the display primitives Ray may use when it builds a layout.
// ═══════════════════════════════════════════════════════════

export type CatalogEntry = { id: string; description: string; input: Record<string, unknown> };

export const CATALOG: CatalogEntry[] = [
  // screens
  { id: 'home', description: 'Dashboard.', input: homeInputSchema },
  { id: 'deals', description: 'Deals — table or pipeline board.', input: dealsInputSchema },
  { id: 'contacts', description: 'Contacts list.', input: contactsInputSchema },
  { id: 'companies', description: 'Companies list.', input: companiesInputSchema },
  { id: 'tasks', description: 'Tasks.', input: tasksInputSchema },
  { id: 'settings', description: 'Workspace settings.', input: settingsInputSchema },
  // records
  { id: 'deal', description: 'A deal.', input: dealInputSchema },
  { id: 'contact', description: 'A contact.', input: contactInputSchema },
  { id: 'company', description: 'A company.', input: companyInputSchema },
  // forms (the user reviews and submits)
  { id: 'deal.form', description: 'Form to create or edit a deal; the user submits it.', input: dealFormInputSchema },
  { id: 'contact.form', description: 'Form to create or edit a contact; the user submits it.', input: contactFormInputSchema },
  { id: 'company.form', description: 'Form to create or edit a company; the user submits it.', input: companyFormInputSchema },
];

export const CATALOG_IDS = new Set(CATALOG.map((c) => c.id));

// The components Ray may use when it builds a layout — curated to display/layout
// primitives (nav/chrome/form components are left out).
export const VIZ_COMPONENTS = ['Box', 'Stack', 'Row', 'Grid', 'Text', 'Badge', 'Avatar', 'Icon', 'Table'];

// Presentational props stripped from the layout agent's palette — it can't set a
// background, a class, a border, spacing, or a size, so every component renders in
// its default relay style. (Semantic props like a Badge's tone stay.)
export const VIZ_OMIT_PROPS = ['bg', 'class', 'border', 'radius', 'glow', 'pad', 'px', 'py', 'width', 'h'];

// House style handed to the layout agent, so its output is consistent and plain.
export const LAYOUT_STYLE = [
  'Relay house style — keep it plain and minimal:',
  '- Use components in their default styling. Never fake a container or a background.',
  '- A single value (a KPI) is a Stack: a large Text for the number, then a small Text label beneath. No box, no background.',
  '- A list of records is a Table.',
  '- Use the fewest components that convey the data.',
].join('\n');
