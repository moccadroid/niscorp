import { z } from 'zod';

// What Ray is allowed to open, and what each action's settable input means. This
// describes the REAL actions (same ids the shell registers) — Ray reads it, picks
// one, fills the input. The schemas serialize to JSON Schema (z.toJSONSchema) for
// the prompt; `.describe()` carries the meaning. Only the intent fields are here —
// runtime state (loading, rows, menus) is not settable and is omitted.
export type CatalogEntry = { id: string; description: string; input: z.ZodType };

const id = (entity: string) => z.string().describe(`${entity} id (use find_records to resolve a name to an id)`);

export const CATALOG: CatalogEntry[] = [
  // ── screens ──
  { id: 'home', description: 'Dashboard.', input: z.object({}) },
  {
    id: 'deals',
    description: 'Deals — table or pipeline board.',
    input: z.object({
      view: z.enum(['table', 'board']).optional().describe("'board' for the pipeline Kanban, else the table"),
      ownerId: z.enum(['', 'me']).optional().describe("'me' to show only the current user's deals"),
      sortBy: z.string().optional().describe("e.g. 'deals.value', 'deals.created_at'"),
      sortDir: z.enum(['asc', 'desc']).optional(),
      search: z.string().optional().describe('search text'),
      highlight_id: z.string().optional().describe('a deal id to highlight'),
    }),
  },
  {
    id: 'contacts',
    description: 'Contacts list.',
    input: z.object({
      search: z.string().optional(),
      sortBy: z.string().optional().describe("a column: 'contacts.last_name', 'contacts.title', 'contacts.email', 'companies.name'"),
      sortDir: z.enum(['asc', 'desc']).optional(),
      highlight_id: z.string().optional(),
    }),
  },
  {
    id: 'companies',
    description: 'Companies list.',
    input: z.object({
      search: z.string().optional(),
      sortBy: z.string().optional().describe("a column: 'companies.name', 'companies.industry', 'companies.size', 'companies.domain'"),
      sortDir: z.enum(['asc', 'desc']).optional(),
      highlight_id: z.string().optional(),
    }),
  },
  {
    id: 'tasks',
    description: 'Tasks.',
    input: z.object({
      scope: z.enum(['open', 'overdue', 'done', 'all']).optional(),
      search: z.string().optional(),
      sortBy: z.string().optional().describe("a column: 'tasks.due_date', 'tasks.title', 'tasks.created_at'"),
      sortDir: z.enum(['asc', 'desc']).optional(),
    }),
  },
  { id: 'settings', description: 'Workspace settings.', input: z.object({}) },

  // ── records ──
  { id: 'deal', description: 'A deal.', input: z.object({ id: id('deal') }) },
  { id: 'contact', description: 'A contact.', input: z.object({ id: id('contact') }) },
  { id: 'company', description: 'A company.', input: z.object({ id: id('company') }) },

  // ── forms (the user reviews and submits) ──
  {
    id: 'deal.form',
    description: 'Form to create or edit a deal; the user submits it.',
    input: z.object({
      title: z.string().optional(),
      company: z.string().optional().describe('company id'),
      stage: z.string().optional().describe('stage id'),
      contact: z.string().optional().describe('primary contact id'),
      value: z.number().optional(),
      close_date: z.string().optional().describe('ISO date'),
      id: z.string().optional().describe('deal id when editing'),
    }),
  },
  {
    id: 'contact.form',
    description: 'Form to create or edit a contact; the user submits it.',
    input: z.object({
      name: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      title: z.string().optional(),
      company: z.string().optional().describe('company id'),
      id: z.string().optional(),
    }),
  },
  {
    id: 'company.form',
    description: 'Form to create or edit a company; the user submits it.',
    input: z.object({
      name: z.string().optional(),
      domain: z.string().optional(),
      industry: z.string().optional(),
      size: z.string().optional(),
      id: z.string().optional(),
    }),
  },
];

export const CATALOG_IDS = new Set(CATALOG.map((c) => c.id));
