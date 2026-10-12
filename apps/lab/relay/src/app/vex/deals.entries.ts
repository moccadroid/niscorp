import type { CacheEntry } from './index';
import type { MutationEntry } from './index';
import { money, dateText } from '@relay/app/prisms/format.prism';

export const dealsList: CacheEntry = {
  fingerprint: 'deals/list',
  intent: 'List all deals with company, stage, owner, value and dates for the deals table',
  shape: [{ deal_id: '', title: '', company: '', company_id: '', stage: '', stage_id: '', owner: '', value: 0, value_display: '', status: '', close_date: '', close_date_display: '', created_at: '', primary_contact_id: '' }],
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.title',
      'deals.value',
      'deals.status',
      'deals.close_date',
      'deals.created_at',
      'deals.company_id',
      'deals.stage_id',
      'deals.primary_contact_id',
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: { or: [{ ilike: ['deals.title', { $context: 'q' }] }, { ilike: ['companies.name', { $context: 'q' }] }] },
    sort: [{ field: 'deals.created_at', dir: 'desc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        company: { $get: { from: { $var: 'r' }, path: ['company'] } },
        company_id: { $get: { from: { $var: 'r' }, path: ['company_id'] } },
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        stage_id: { $get: { from: { $var: 'r' }, path: ['stage_id'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        close_date: { $get: { from: { $var: 'r' }, path: ['close_date'] } },
        close_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['close_date'] } }),
        created_at: dateText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
        primary_contact_id: { $get: { from: { $var: 'r' }, path: ['primary_contact_id'] } },
      },
    },
  },
};

export const dealsByOwner: CacheEntry = {
  fingerprint: 'deals/byOwner',
  intent: "List a user's deals with company, stage, value and dates",
  shape: [{ deal_id: '', title: '', company: '', company_id: '', stage: '', stage_id: '', owner: '', owner_id: '', value: 0, value_display: '', status: '', close_date: '', close_date_display: '', created_at: '', primary_contact_id: '' }],
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.title',
      'deals.value',
      'deals.status',
      'deals.close_date',
      'deals.created_at',
      'deals.company_id',
      'deals.stage_id',
      'deals.primary_contact_id',
      'deals.owner_id',
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: {
      and: [
        { eq: ['deals.owner_id', { $context: 'ownerId' }] },
        { or: [{ ilike: ['deals.title', { $context: 'q' }] }, { ilike: ['companies.name', { $context: 'q' }] }] },
      ],
    },
    sort: [{ field: 'deals.created_at', dir: 'desc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        company: { $get: { from: { $var: 'r' }, path: ['company'] } },
        company_id: { $get: { from: { $var: 'r' }, path: ['company_id'] } },
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        stage_id: { $get: { from: { $var: 'r' }, path: ['stage_id'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        owner_id: { $get: { from: { $var: 'r' }, path: ['owner_id'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        close_date: { $get: { from: { $var: 'r' }, path: ['close_date'] } },
        close_date_display: dateText({ $get: { from: { $var: 'r' }, path: ['close_date'] } }),
        created_at: dateText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
        primary_contact_id: { $get: { from: { $var: 'r' }, path: ['primary_contact_id'] } },
      },
    },
  },
};

export const dealById: CacheEntry = {
  fingerprint: 'deals/byId',
  intent: 'Load one deal by id — company, stage, owner, win-% and primary contact id',
  shape: { deal_id: '', title: '', company: '', company_id: '', stage: '', stage_id: '', owner: '', owner_id: '', value: 0, value_display: '', status: '', close_date: '', close_date_display: '', prob: 0, primary_contact_id: '' },
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.title',
      'deals.value',
      'deals.status',
      'deals.close_date',
      'deals.company_id',
      'deals.owner_id',
      'deals.stage_id',
      'deals.primary_contact_id',
      { field: 'stages.win_probability', as: 'prob' },
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: { eq: ['deals.id', { $context: 'id' }] },
    limit: 1,
  },
  mapping: {
    deal_id: { $ref: '$.result.deal_id' },
    title: { $ref: '$.result.title' },
    company: { $ref: '$.result.company' },
    company_id: { $ref: '$.result.company_id' },
    stage: { $ref: '$.result.stage' },
    stage_id: { $ref: '$.result.stage_id' },
    owner: { $ref: '$.result.owner' },
    owner_id: { $ref: '$.result.owner_id' },
    value: { $ref: '$.result.value' },
    value_display: money({ $ref: '$.result.value' }),
    status: { $ref: '$.result.status' },
    close_date: { $ref: '$.result.close_date' },
    close_date_display: dateText({ $ref: '$.result.close_date' }),
    prob: { $ref: '$.result.prob' },
    primary_contact_id: { $ref: '$.result.primary_contact_id' },
  },
};

export const dealsByCompany: CacheEntry = {
  fingerprint: 'deals/byCompany',
  intent: "List a company's open deals with stage",
  shape: [{ deal_id: '', title: '', value: 0, value_display: '', stage: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: [{ field: 'deals.id', as: 'deal_id' }, 'deals.title', 'deals.value', { field: 'stages.name', as: 'stage' }],
    filter: { and: [{ eq: ['deals.company_id', { $context: 'companyId' }] }, { eq: ['deals.status', 'open'] }] },
    sort: [{ field: 'deals.value', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
      },
    },
  },
};

export const dealsByContact: CacheEntry = {
  fingerprint: 'deals/byContact',
  intent: "List a contact's deals (any status) where they are the primary contact",
  shape: [{ deal_id: '', title: '', value: 0, value_display: '', stage: '', status: '', tone: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: [{ field: 'deals.id', as: 'deal_id' }, 'deals.title', 'deals.value', 'deals.status', { field: 'stages.name', as: 'stage' }],
    filter: { eq: ['deals.primary_contact_id', { $context: 'contactId' }] },
    sort: [{ field: 'deals.value', dir: 'desc' }],
    limit: 50,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        tone: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'won'] }, then: 'green' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'lost'] }, then: 'red' },
            ],
            else: 'blue',
          },
        },
      },
    },
  },
};

export const dealsBoard: CacheEntry = {
  fingerprint: 'deals/board',
  intent: 'List open deals with company, owner, stage, value and close date for the pipeline board',
  shape: [{ deal_id: '', company: '', owner: '', stage: '', value: 0, value_display: '', close_date: '' }],
  dsl: {
    from: ['deals', 'companies', 'stages', 'users'],
    fields: [
      { field: 'deals.id', as: 'deal_id' },
      'deals.value',
      'deals.close_date',
      { field: 'companies.name', as: 'company' },
      { field: 'stages.name', as: 'stage' },
      { field: 'users.name', as: 'owner' },
    ],
    filter: { eq: ['deals.status', 'open'] },
    sort: [{ field: 'deals.created_at', dir: 'desc' }],
    limit: 500,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        deal_id: { $get: { from: { $var: 'r' }, path: ['deal_id'] } },
        company: { $get: { from: { $var: 'r' }, path: ['company'] } },
        owner: { $get: { from: { $var: 'r' }, path: ['owner'] } },
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        value: { $get: { from: { $var: 'r' }, path: ['value'] } },
        value_display: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        close_date: dateText({ $get: { from: { $var: 'r' }, path: ['close_date'] } }),
      },
    },
  },
};

export const dealsOpenByStage: CacheEntry = {
  fingerprint: 'deals/openByStage',
  intent: 'Open deals per pipeline stage — count, total value, win %, in stage order',
  shape: [{ stage: '', stage_id: '', count: 0, value: '', prob: 0, tone: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, { field: 'stages.name', as: 'stage' }, { field: 'stages.win_probability', as: 'prob' }],
    aggregate: { count: { count: '*' }, value: { sum: 'deals.value' } },
    filter: { eq: ['deals.status', 'open'] },
    groupBy: ['stages.id', 'stages.name', 'stages.position', 'stages.win_probability'],
    sort: [{ field: 'stages.position', dir: 'asc' }],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stage: { $get: { from: { $var: 'r' }, path: ['stage'] } },
        stage_id: { $get: { from: { $var: 'r' }, path: ['stage_id'] } },
        count: { $get: { from: { $var: 'r' }, path: ['count'] } },
        value: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
        prob: { $get: { from: { $var: 'r' }, path: ['prob'] } },
        tone: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Lead'] }, then: 'slate' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Qualified'] }, then: 'blue' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Proposal'] }, then: 'amber' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['stage'] } }, 'Negotiation'] }, then: 'pink' },
            ],
            else: 'slate',
          },
        },
      },
    },
  },
};

export const dealsForecast: CacheEntry = {
  fingerprint: 'deals/forecast',
  intent: 'Open pipeline total and weighted forecast',
  shape: { total: '', weighted: '' },
  dsl: {
    from: ['deals', 'stages'],
    aggregate: {
      total: { sum: 'deals.value' },
      weighted_pct: { sum: { multiply: ['deals.value', 'stages.win_probability'] } },
    },
    filter: { eq: ['deals.status', 'open'] },
  },
  mapping: {
    total: money({ $ref: '$.result.total' }),
    weighted: money({ $div: [{ $ref: '$.result.weighted_pct' }, 100] }),
  },
};

export const dealsByStatus: CacheEntry = {
  fingerprint: 'deals/byStatus',
  intent: 'Total value and count of deals for a given status',
  shape: { status: '', value: '', count: 0 },
  dsl: {
    from: ['deals'],
    fields: ['deals.status'],
    aggregate: { value: { sum: 'deals.value' }, count: { count: '*' } },
    filter: { eq: ['deals.status', { $context: 'status' }] },
    groupBy: ['deals.status'],
  },
  mapping: {
    status: { $ref: '$.result.status' },
    value: money({ $ref: '$.result.value' }),
    count: { $ref: '$.result.count' },
  },
};

export const dealsByStage: CacheEntry = {
  fingerprint: 'deals/byStage',
  intent: 'Count and total deal value grouped by stage',
  shape: [{ name: '', count: 0, value: '' }],
  dsl: {
    from: ['deals', 'stages'],
    fields: ['stages.name'],
    aggregate: { count: { count: '*' }, value: { sum: 'deals.value' } },
    groupBy: ['stages.name'],
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        name: { $get: { from: { $var: 'r' }, path: ['name'] } },
        count: { $get: { from: { $var: 'r' }, path: ['count'] } },
        value: money({ $get: { from: { $var: 'r' }, path: ['value'] } }),
      },
    },
  },
};

export const companyOptions: CacheEntry = {
  fingerprint: 'deals/companyOptions',
  intent: 'Companies as id/name options for a picker',
  shape: [{ company_id: '', name: '' }],
  dsl: {
    from: ['companies'],
    fields: [{ field: 'companies.id', as: 'company_id' }, 'companies.name'],
    sort: [{ field: 'companies.name', dir: 'asc' }],
    limit: 500,
  },
};

export const stageOptions: CacheEntry = {
  fingerprint: 'deals/stageOptions',
  intent: 'In-progress pipeline stages as id/name options, in order (excludes the terminal Closed Won/Lost — those are reached by marking a deal won/lost, not by picking the stage; an open deal in a terminal stage would have no board column)',
  shape: [{ stage_id: '', name: '' }],
  dsl: {
    from: ['stages'],
    fields: [{ field: 'stages.id', as: 'stage_id' }, 'stages.name'],
    filter: { and: [{ gt: ['stages.win_probability', 0] }, { lt: ['stages.win_probability', 100] }] },
    sort: [{ field: 'stages.position', dir: 'asc' }],
  },
};

export const contactOptions: CacheEntry = {
  fingerprint: 'deals/contactOptions',
  intent: 'Contacts as id/name options for a picker',
  shape: [{ contact_id: '', name: '' }],
  dsl: {
    from: ['contacts'],
    fields: [{ field: 'contacts.id', as: 'contact_id' }],
    compute: { name: { concat: ['contacts.first_name', ' ', 'contacts.last_name'] } },
    sort: [{ field: 'contacts.last_name', dir: 'asc' }],
    limit: 500,
  },
};

export const dealUpsert: MutationEntry = {
  fingerprint: 'deals/upsert',
  intent: 'Create a deal, or edit one by id',
  mutation: {
    op: 'upsert',
    table: 'deals',
    key: 'id',
    columns: {
      title: { $context: 'title' },
      company_id: { $context: 'company_id' },
      stage_id: { $context: 'stage_id' },
      primary_contact_id: { $context: 'primary_contact_id' },
      value: { $context: 'value' },
      close_date: { $context: 'close_date' },
    },
  },
};

export const dealMoveStage: MutationEntry = {
  fingerprint: 'deals/moveStage',
  intent: "Move a deal to a pipeline stage (the board's drag-drop)",
  mutation: {
    op: 'update',
    table: 'deals',
    set: { stage_id: { $context: 'stage_id' } },
    where: { eq: ['deals.id', { $context: 'deal_id' }] },
  },
};

export const dealMarkWon: MutationEntry = {
  fingerprint: 'deals/markWon',
  intent: 'Close a deal as won',
  mutation: {
    op: 'update',
    table: 'deals',
    set: { status: 'won' },
    where: { eq: ['deals.id', { $context: 'deal_id' }] },
  },
};

export const dealMarkLost: MutationEntry = {
  fingerprint: 'deals/markLost',
  intent: 'Close a deal as lost',
  mutation: {
    op: 'update',
    table: 'deals',
    set: { status: 'lost' },
    where: { eq: ['deals.id', { $context: 'deal_id' }] },
  },
};

export const dealDelete: MutationEntry = {
  fingerprint: 'deals/delete',
  intent: 'Delete a deal by id (cascades its line items)',
  mutation: {
    op: 'delete',
    table: 'deals',
    where: { eq: ['deals.id', { $context: 'id' }] },
  },
};
