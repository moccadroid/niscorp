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

export const resourceEntities = (path: string): string[] | undefined => {
  const match = /\/api\/([a-z_]+)\/vex$/.exec(path);
  const resource = match?.[1];
  return resource !== undefined ? RESOURCES[resource]?.entities : undefined;
};
