// ═══════════════════════════════════════════════════════════
// Vex resources — the scoped query surfaces, mounted under /api/<resource>/vex.
//
// A resource is an entity plus everything it can join with: the subgraph a
// screen (or, later, Ray) is allowed to discover and query. Vex enforces it on
// BOTH sides — `handleDiscovery` returns only these entities, and a novel query
// (cache miss) can only generate DSL over them. Prewarmed reads cache-hit
// regardless, so the filter is really about discovery + ad-hoc queries.
//
// The base `/api/vex` (no resource) exposes the full schema for cross-resource
// reads (sidebar counts, the home dashboard). Open, but the narrow per-resource
// endpoints are the ones to reach for.
// ═══════════════════════════════════════════════════════════

export type VexResource = {
  entities: string[];
  description: string;
};

export const RESOURCES: Record<string, VexResource> = {
  deals: {
    entities: ['deals', 'companies', 'stages', 'pipelines', 'contacts', 'users', 'products', 'deal_products', 'activities', 'tasks'],
    description: 'Deals with their company, pipeline stage, owner, line items, activity and tasks.',
  },
  contacts: {
    entities: ['contacts', 'companies', 'deals', 'tasks', 'activities', 'users', 'lists', 'list_members'],
    description: 'Contacts with their company, deals, tasks, activity and list membership.',
  },
  companies: {
    entities: ['companies', 'contacts', 'deals', 'activities', 'users'],
    description: 'Companies with their contacts, deals and activity.',
  },
  tasks: {
    entities: ['tasks', 'deals', 'contacts', 'companies', 'users'],
    description: 'Tasks with the deal, contact or company they belong to.',
  },
};

// Resolve a request path to its entity filter. `/api/deals/vex` → the deals
// subgraph; `/api/vex` (base) → undefined (full schema).
export const resourceEntities = (path: string): string[] | undefined => {
  const match = /\/api\/([a-z_]+)\/vex$/.exec(path);
  const resource = match?.[1];
  return resource !== undefined ? RESOURCES[resource]?.entities : undefined;
};
