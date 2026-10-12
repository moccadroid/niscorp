import type { CacheEntry, MutationEntry } from './index';
import { stampText, statusTone, severityTone, roomStatusText, roomStatusTone } from '@atrium/app/prisms/format.prism';

export const issuesBoard: CacheEntry = {
  fingerprint: 'issues/board',
  intent: 'Issues at a property filtered by status and search, newest first',
  shape: [{ issue_id: '', summary: '', detail: '', kind: '', severity: '', severity_tone: '', status: '', status_tone: '', room_id: '', room_number: '', raised_by: '', raised_display: '', stay_id: '' }],
  dsl: {
    from: ['issues', 'rooms'],
    fields: [
      { field: 'issues.id', as: 'issue_id' },
      'issues.summary',
      'issues.detail',
      'issues.kind',
      'issues.severity',
      'issues.status',
      'issues.raised_by',
      'issues.raised_at',
      'issues.stay_id',
      'issues.room_id',
      { field: 'rooms.number', as: 'room_number' },
    ],
    filter: {
      and: [
        { eq: ['issues.property_id', { $context: 'propertyId' }] },
        { gte: ['issues.status', { $context: 'statusMin' }] },
        { lte: ['issues.status', { $context: 'statusMax' }] },
        { ilike: ['issues.summary', { $context: 'q' }] },
      ],
    },
    sort: [{ field: 'issues.raised_at', dir: 'desc' }],
    limit: 80,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        issue_id: { $get: { from: { $var: 'r' }, path: ['issue_id'] } },
        summary: { $get: { from: { $var: 'r' }, path: ['summary'] } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        severity: { $get: { from: { $var: 'r' }, path: ['severity'] } },
        severity_tone: severityTone({ $get: { from: { $var: 'r' }, path: ['severity'] } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'] } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
        raised_by: { $get: { from: { $var: 'r' }, path: ['raised_by'] } },
        raised_display: stampText({ $get: { from: { $var: 'r' }, path: ['raised_at'] } }),
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
      },
    },
  },
};

export const issueById: CacheEntry = {
  fingerprint: 'issues/byId',
  intent: 'One issue by id, with its room',
  shape: { issue_id: '', summary: '', detail: '', kind: '', severity: '', severity_tone: '', status: '', status_tone: '', room_id: '', room_number: '', raised_by: '', raised_display: '', stay_id: '' },
  dsl: {
    from: ['issues', 'rooms'],
    fields: [
      { field: 'issues.id', as: 'issue_id' },
      'issues.summary',
      'issues.detail',
      'issues.kind',
      'issues.severity',
      'issues.status',
      'issues.raised_by',
      'issues.raised_at',
      'issues.stay_id',
      'issues.room_id',
      { field: 'rooms.number', as: 'room_number' },
    ],
    filter: { eq: ['issues.id', { $context: 'issueId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        issue_id: { $get: { from: { $var: 'r' }, path: ['issue_id'], fallback: { $const: '' } } },
        summary: { $get: { from: { $var: 'r' }, path: ['summary'], fallback: { $const: '' } } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'], fallback: { $const: '' } } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'], fallback: { $const: '' } } },
        severity: { $get: { from: { $var: 'r' }, path: ['severity'], fallback: { $const: '' } } },
        severity_tone: severityTone({ $get: { from: { $var: 'r' }, path: ['severity'], fallback: { $const: null } } }),
        status: { $get: { from: { $var: 'r' }, path: ['status'], fallback: { $const: '' } } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'], fallback: { $const: null } } }),
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'], fallback: { $const: '' } } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '' } } },
        raised_by: { $get: { from: { $var: 'r' }, path: ['raised_by'], fallback: { $const: '' } } },
        raised_display: stampText({ $get: { from: { $var: 'r' }, path: ['raised_at'], fallback: { $const: null } } }),
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'], fallback: { $const: '' } } },
      },
    },
  },
};

export const issuesForStay: CacheEntry = {
  fingerprint: 'issues/forStay',
  intent: 'Issues raised against one stay, newest first',
  shape: [{ issue_id: '', summary: '', detail: '', status: '', status_tone: '', kind: '', raised_display: '' }],
  dsl: {
    from: ['issues'],
    fields: [{ field: 'issues.id', as: 'issue_id' }, 'issues.summary', 'issues.detail', 'issues.status', 'issues.kind', 'issues.raised_at'],
    filter: { eq: ['issues.stay_id', { $context: 'stayId' }] },
    sort: [{ field: 'issues.raised_at', dir: 'desc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        issue_id: { $get: { from: { $var: 'r' }, path: ['issue_id'] } },
        summary: { $get: { from: { $var: 'r' }, path: ['summary'] } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        raised_display: stampText({ $get: { from: { $var: 'r' }, path: ['raised_at'] } }),
      },
    },
  },
};

export const issuesOpenCount: CacheEntry = {
  fingerprint: 'issues/openCount',
  intent: 'Count of open issues at a property',
  shape: { count: 0 },
  dsl: {
    from: ['issues'],
    aggregate: { count: { count: '*' } },
    filter: { and: [{ eq: ['issues.property_id', { $context: 'propertyId' }] }, { eq: ['issues.status', 'open'] }] },
  },
  mapping: { $ref: '$.result' },
};

export const issuesByKind: CacheEntry = {
  fingerprint: 'issues/byKind',
  intent: 'Issue counts grouped by kind at a property',
  shape: [{ kind: '', count: 0 }],
  dsl: {
    from: ['issues'],
    fields: ['issues.kind'],
    aggregate: { count: { count: '*' } },
    filter: { eq: ['issues.property_id', { $context: 'propertyId' }] },
    groupBy: ['issues.kind'],
    sort: [{ field: 'count', dir: 'desc' }],
    limit: 20,
  },
};

export const issuesByRoom: CacheEntry = {
  fingerprint: 'issues/byRoom',
  intent: 'Issue counts grouped by room at a property, worst first',
  shape: [{ room_number: '', count: 0 }],
  dsl: {
    from: ['issues', 'rooms'],
    fields: [{ field: 'rooms.number', as: 'room_number' }],
    aggregate: { count: { count: '*' } },
    filter: { eq: ['issues.property_id', { $context: 'propertyId' }] },
    groupBy: ['rooms.number'],
    sort: [{ field: 'count', dir: 'desc' }],
    limit: 10,
  },
};

export const tasksAssigned: CacheEntry = {
  fingerprint: 'tasks/assigned',
  intent: 'Tasks assigned to a staff member filtered by status, newest first',
  shape: [{ task_id: '', title: '', kind: '', status: '', status_tone: '', room_number: '', created_display: '' }],
  dsl: {
    from: ['tasks', 'rooms'],
    fields: [
      { field: 'tasks.id', as: 'task_id' },
      'tasks.title',
      'tasks.kind',
      'tasks.status',
      'tasks.created_at',
      { field: 'rooms.number', as: 'room_number' },
    ],
    filter: {
      and: [
        { eq: ['tasks.assignee_id', { $context: 'staffId' }] },
        { gte: ['tasks.status', { $context: 'statusMin' }] },
        { lte: ['tasks.status', { $context: 'statusMax' }] },
      ],
    },
    sort: [{ field: 'tasks.created_at', dir: 'desc' }],
    limit: 40,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        task_id: { $get: { from: { $var: 'r' }, path: ['task_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
        created_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

export const tasksForIssue: CacheEntry = {
  fingerprint: 'tasks/forIssue',
  intent: 'Tasks dispatched for one issue',
  shape: [{ task_id: '', title: '', status: '', kind: '' }],
  dsl: {
    from: ['tasks'],
    fields: [{ field: 'tasks.id', as: 'task_id' }, 'tasks.title', 'tasks.status', 'tasks.kind'],
    filter: { eq: ['tasks.issue_id', { $context: 'issueId' }] },
    sort: [{ field: 'tasks.created_at', dir: 'desc' }],
    limit: 10,
  },
};

export const staffSettings: CacheEntry = {
  fingerprint: 'staff/settings',
  intent: "A staff member's own settings — how much of the screen the assistant places, and which model it runs on",
  shape: { layout_control: '', assistant_model: '' },
  dsl: {
    from: ['staff'],
    fields: ['staff.layout_control', 'staff.assistant_model'],
    filter: { eq: ['staff.id', { $context: 'staffId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        layout_control: { $get: { from: { $var: 'r' }, path: ['layout_control'], fallback: { $const: 'mixed' } } },
        assistant_model: { $get: { from: { $var: 'r' }, path: ['assistant_model'], fallback: { $const: '' } } },
      },
    },
  },
};

// The `staff` write behavior matches `id` against the caller's own principal,
// so a forged staffId updates nothing.
export const staffSetLayout: MutationEntry = {
  fingerprint: 'staff/setLayout',
  intent: "Set how much of a staff member's screen the assistant places",
  mutation: {
    op: 'update',
    table: 'staff',
    set: { layout_control: { $context: 'layoutControl' } },
    where: { eq: ['staff.id', { $context: 'staffId' }] },
  },
};

export const staffSetModel: MutationEntry = {
  fingerprint: 'staff/setModel',
  intent: 'Set which model a staff member’s assistant runs on',
  mutation: {
    op: 'update',
    table: 'staff',
    set: { assistant_model: { $context: 'assistantModel' } },
    where: { eq: ['staff.id', { $context: 'staffId' }] },
  },
};

export const staffAtProperty: CacheEntry = {
  fingerprint: 'staff/atProperty',
  intent: 'Staff at a property',
  shape: [{ staff_id: '', name: '', job: '' }],
  dsl: {
    from: ['staff'],
    fields: [{ field: 'staff.id', as: 'staff_id' }, 'staff.name', 'staff.job'],
    filter: { eq: ['staff.property_id', { $context: 'propertyId' }] },
    sort: [{ field: 'staff.name', dir: 'asc' }],
    limit: 40,
  },
};

export const opsInHouse: CacheEntry = {
  fingerprint: 'ops/inHouse',
  intent: 'Count of stays currently in house at a property',
  shape: { count: 0 },
  dsl: {
    from: ['stays'],
    aggregate: { count: { count: '*' } },
    filter: { and: [{ eq: ['stays.property_id', { $context: 'propertyId' }] }, { eq: ['stays.state', 'in_house'] }] },
  },
  mapping: { $ref: '$.result' },
};

export const opsArriving: CacheEntry = {
  fingerprint: 'ops/arriving',
  intent: 'Count of stays arriving at a property',
  shape: { count: 0 },
  dsl: {
    from: ['stays'],
    aggregate: { count: { count: '*' } },
    filter: { and: [{ eq: ['stays.property_id', { $context: 'propertyId' }] }, { eq: ['stays.state', 'arriving'] }] },
  },
  mapping: { $ref: '$.result' },
};

export const roomsForProperty: CacheEntry = {
  fingerprint: 'rooms/forProperty',
  intent: 'Rooms at a property with their housekeeping status, by number',
  shape: [{ room_id: '', number: '', number_display: '', kind: '', where: '', status: '', state: '', state_tone: '', out_of_order: false, sellable: false }],
  dsl: {
    from: ['rooms'],
    fields: [{ field: 'rooms.id', as: 'room_id' }, 'rooms.number', 'rooms.kind', 'rooms.floor', 'rooms.status'],
    filter: {
      and: [
        { eq: ['rooms.property_id', { $context: 'propertyId' }] },
        { in: ['rooms.status', { $context: 'statuses' }] },
      ],
    },
    sort: [{ field: 'rooms.number', dir: 'asc' }],
    limit: 200,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'] } },
        number: { $get: { from: { $var: 'r' }, path: ['number'] } },
        number_display: { $join: { parts: ['Room ', { $get: { from: { $var: 'r' }, path: ['number'] } }], sep: '' } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        where: {
          $join: {
            parts: [
              { $get: { from: { $var: 'r' }, path: ['kind'] } },
              { $join: { parts: ['floor ', { $get: { from: { $var: 'r' }, path: ['floor'] } }], sep: '' } },
            ],
            sep: ' · ',
          },
        },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        state: roomStatusText({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        state_tone: roomStatusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        out_of_order: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'out_of_order'] },
        sellable: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'inspected'] },
      },
    },
  },
};

export const roomById: CacheEntry = {
  fingerprint: 'rooms/byId',
  intent: 'One room by id with its status',
  shape: { room_id: '', number: '', number_display: '', kind: '', status: '', state: '', state_tone: '', sellable: false },
  dsl: {
    from: ['rooms'],
    fields: [{ field: 'rooms.id', as: 'room_id' }, 'rooms.number', 'rooms.kind', 'rooms.status'],
    filter: { eq: ['rooms.id', { $context: 'roomId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'], fallback: { $const: '' } } },
        number: { $get: { from: { $var: 'r' }, path: ['number'], fallback: { $const: '' } } },
        number_display: { $join: { parts: ['Room ', { $get: { from: { $var: 'r' }, path: ['number'], fallback: { $const: '' } } }], sep: '' } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'], fallback: { $const: '' } } },
        status: { $get: { from: { $var: 'r' }, path: ['status'], fallback: { $const: '' } } },
        state: roomStatusText({ $get: { from: { $var: 'r' }, path: ['status'], fallback: { $const: '' } } }),
        state_tone: roomStatusTone({ $get: { from: { $var: 'r' }, path: ['status'], fallback: { $const: '' } } }),
        sellable: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'], fallback: { $const: '' } } }, 'inspected'] },
      },
    },
  },
};

// `inspected`, not `clean`: clean means housekeeping has finished, inspected
// means a supervisor has signed it off and it may be sold.
export const roomsFree: CacheEntry = {
  fingerprint: 'rooms/free',
  intent: 'Rooms at a property that are inspected and unoccupied tonight, optionally of one kind',
  shape: [{ room_id: '', number: '', number_display: '', kind: '', where: '', floor: 0 }],
  dsl: {
    from: ['rooms'],
    fields: [{ field: 'rooms.id', as: 'room_id' }, 'rooms.number', 'rooms.kind', 'rooms.floor'],
    filter: {
      and: [
        { eq: ['rooms.property_id', { $context: 'propertyId' }] },
        { eq: ['rooms.status', 'inspected'] },
        { ilike: ['rooms.kind', { $context: 'kind' }] },
        {
          not: {
            exists: {
              from: ['stays'],
              filter: {
                and: [
                  { eq: ['stays.room_id', 'rooms.id'] },
                  { or: [{ eq: ['stays.state', 'in_house'] }, { eq: ['stays.state', 'arriving'] }] },
                ],
              },
            },
          },
        },
      ],
    },
    sort: [{ field: 'rooms.number', dir: 'asc' }],
    limit: 40,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'] } },
        number: { $get: { from: { $var: 'r' }, path: ['number'] } },
        number_display: { $join: { parts: ['Room ', { $get: { from: { $var: 'r' }, path: ['number'] } }], sep: '' } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        where: { $join: { parts: [{ $get: { from: { $var: 'r' }, path: ['kind'] } }, { $join: { parts: ['floor ', { $get: { from: { $var: 'r' }, path: ['floor'] } }], sep: '' } }], sep: ' · ' } },
        floor: { $get: { from: { $var: 'r' }, path: ['floor'] } },
      },
    },
  },
};

export const opsOutOfOrder: CacheEntry = {
  fingerprint: 'ops/outOfOrder',
  intent: 'Count of rooms out of order at a property',
  shape: { count: 0 },
  dsl: {
    from: ['rooms'],
    aggregate: { count: { count: '*' } },
    filter: { and: [{ eq: ['rooms.property_id', { $context: 'propertyId' }] }, { eq: ['rooms.status', 'out_of_order'] }] },
  },
  mapping: { $ref: '$.result' },
};

export const opsNotReady: CacheEntry = {
  fingerprint: 'ops/notReady',
  intent: 'Count of rooms at a property still to be turned',
  shape: { count: 0 },
  dsl: {
    from: ['rooms'],
    aggregate: { count: { count: '*' } },
    filter: { and: [{ eq: ['rooms.property_id', { $context: 'propertyId' }] }, { eq: ['rooms.status', 'dirty'] }] },
  },
  mapping: { $ref: '$.result' },
};

// `property_id` is not listed: the scope `set` behaviour stamps it from the
// caller's tenant on insert.
export const issueRaise: MutationEntry = {
  fingerprint: 'issues/raise',
  intent: 'Raise an issue against a stay and room',
  mutation: {
    op: 'insert',
    table: 'issues',
    values: {
      stay_id: { $context: 'stayId' },
      room_id: { $context: 'roomId' },
      kind: { $context: 'kind' },
      summary: { $context: 'summary' },
      detail: { $context: 'detail' },
      severity: { $context: 'severity' },
      raised_by: { $context: 'raisedBy' },
    },
  },
};

export const issueSetStatus: MutationEntry = {
  fingerprint: 'issues/setStatus',
  intent: "Set an issue's status",
  mutation: {
    op: 'update',
    table: 'issues',
    set: { status: { $context: 'status' }, resolved_at: { $context: 'resolvedAt' } },
    where: { eq: ['issues.id', { $context: 'issueId' }] },
  },
};

export const taskDispatch: MutationEntry = {
  fingerprint: 'tasks/dispatch',
  intent: 'Dispatch a task for an issue',
  mutation: {
    op: 'insert',
    table: 'tasks',
    values: {
      room_id: { $context: 'roomId' },
      issue_id: { $context: 'issueId' },
      title: { $context: 'title' },
      kind: { $context: 'kind' },
      assignee_id: { $context: 'assigneeId' },
    },
  },
};

export const taskRequest: MutationEntry = {
  fingerprint: 'tasks/request',
  intent: 'Raise a job for something a guest has asked for',
  mutation: {
    op: 'insert',
    table: 'tasks',
    values: {
      stay_id: { $context: 'stayId' },
      room_id: { $context: 'roomId' },
      title: { $context: 'title' },
      detail: { $context: 'detail' },
      kind: { $context: 'kind' },
      assignee_id: { $context: 'assigneeId' },
    },
  },
};

export const taskSetStatus: MutationEntry = {
  fingerprint: 'tasks/setStatus',
  intent: "Set a task's status",
  mutation: {
    op: 'update',
    table: 'tasks',
    set: { status: { $context: 'status' } },
    where: { eq: ['tasks.id', { $context: 'taskId' }] },
  },
};

export const roomSetStatus: MutationEntry = {
  fingerprint: 'rooms/setStatus',
  intent: "Set a room's status — clean, inspected, dirty or out of order",
  mutation: {
    op: 'update',
    table: 'rooms',
    set: { status: { $context: 'status' } },
    where: { eq: ['rooms.id', { $context: 'roomId' }] },
  },
};

export const staySetRoom: MutationEntry = {
  fingerprint: 'stays/setRoom',
  intent: 'Move a stay into a different room',
  mutation: {
    op: 'update',
    table: 'stays',
    set: { room_id: { $context: 'roomId' } },
    where: { eq: ['stays.id', { $context: 'stayId' }] },
  },
};
