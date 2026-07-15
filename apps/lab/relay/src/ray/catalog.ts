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
import { taskFormInputSchema } from '@relay/nova/domains/task/task.form.action';
import { homeInputSchema } from '@relay/nova/surfaces/home/home.action';
import { settingsInputSchema } from '@relay/nova/surfaces/settings/settings.action';

// ═══════════════════════════════════════════════════════════
// Ray's vocabulary — what it may open, and what it may build views with.
//
// The catalog is LIVE: preloaded with the hand-authored screens below, and
// every action built at runtime registers into it (build_action does), so
// Ray, the architect, and the audit all reference one current set. The
// input schema is JSON Schema OWNED BY THE ACTION — each `.action.ts`
// authors it in zod and exports the converted schema, so it can never
// drift from the action's real inputs. Future: this loads from a DB/API —
// MCP-for-actions; the read surface (catalogEntries/catalogIds) is already
// the seam.
//
// VIZ_COMPONENTS: the display primitives Ray may use when it builds a layout.
// ═══════════════════════════════════════════════════════════

export type CatalogEntry = { id: string; description: string; input: Record<string, unknown> };

// The preload — hand-authored screens.
const SEED: CatalogEntry[] = [
  // screens
  { id: 'home', description: 'Dashboard.', input: homeInputSchema },
  { id: 'crm.deals', description: 'Deals — table or pipeline board.', input: dealsInputSchema },
  { id: 'crm.contacts', description: 'Contacts list.', input: contactsInputSchema },
  { id: 'crm.companies', description: 'Companies list.', input: companiesInputSchema },
  { id: 'tasks.manage', description: 'Tasks.', input: tasksInputSchema },
  { id: 'settings', description: 'Workspace settings.', input: settingsInputSchema },
  // records
  { id: 'crm.deal.view', description: 'A deal.', input: dealInputSchema },
  { id: 'crm.contact.view', description: 'A contact.', input: contactInputSchema },
  { id: 'crm.company.view', description: 'A company.', input: companyInputSchema },
  // forms (the user reviews and submits)
  { id: 'crm.deal.form', description: 'Form to create or edit a deal; the user submits it.', input: dealFormInputSchema },
  { id: 'crm.contact.form', description: 'Form to create or edit a contact; the user submits it.', input: contactFormInputSchema },
  { id: 'crm.company.form', description: 'Form to create or edit a company; the user submits it.', input: companyFormInputSchema },
  { id: 'tasks.form', description: 'Form to create or edit a task; the user submits it.', input: taskFormInputSchema },
];

const LIVE: CatalogEntry[] = [...SEED];
const IDS = new Set(LIVE.map((entry) => entry.id));

export const catalogEntries = (): ReadonlyArray<CatalogEntry> => LIVE;
export const catalogIds = (): ReadonlySet<string> => IDS;

// Runtime registration — a built action becomes openable/pushable the moment
// it exists. Replaces by id, so an edited screen updates its entry.
export const registerCatalogEntry = (entry: CatalogEntry): void => {
  const index = LIVE.findIndex((candidate) => candidate.id === entry.id);
  if (index >= 0) LIVE[index] = entry;
  else LIVE.push(entry);
  IDS.add(entry.id);
};

// The components Ray may use when it builds a layout — curated to display/layout
// primitives (nav/chrome/form components are left out).
export const VIZ_COMPONENTS = ['Box', 'Stack', 'Row', 'Grid', 'Text', 'Badge', 'Avatar', 'Icon', 'Table'];

// Presentational props stripped from the layout agent's palette — it can't set a
// background, a border, spacing, or a size, so every component renders in its
// default relay style. (Semantic props like a Badge's tone stay. Class props no
// longer exist anywhere — kit classes are applied inside the components.)
export const VIZ_OMIT_PROPS = ['bg', 'border', 'radius', 'glow', 'pad', 'px', 'py', 'width', 'h'];

// The house style for generated layouts lives in knowledge.ts (styleGuide) —
// one source for the architect AND visualize; the duplicate that used to sit
// here had already drifted from the architect's copy.
