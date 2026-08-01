import type { CacheEntry, MutationEntry } from './index';
import { stampText, statusTone, severityTone, roomStatusText, roomStatusTone } from '@atrium/app/prisms/format.prism';

// Issues and tasks — the rows that carry one guest sentence through four
// audiences. A guest says the air conditioning rattles; that becomes an issue on
// the desk board, a task on a maintenance phone, and a line in the ops manager's
// "what keeps breaking". Same rows the whole way; no copies, no sync.

// The desk's board. `status` arrives as a RANGE the way relay scopes its task
// tabs — one cached plan serves Open / Resolved / All, because Postgres orders
// text and 'open' < 'resolved'.
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

// ONE issue, by id — what a detail surface loads when it is handed an issue.
//
// This read is what makes an issue ADDRESSABLE. The board used to keep the open
// one in its own `data`, written only by a row click, so nothing but a finger
// could put an issue in front of a clerk: no push, no deep link, no agent. A
// detail that takes an `issueId` and loads it needs this, and every fallback is
// stated because an id that no longer resolves is ordinary.
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

// What the guest sees of their own issues: the state of the thing they asked
// about, and nothing about anybody else's room.
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

// The ops manager's recurring-fault question, expressed as a read rather than as
// analysis: issues grouped by kind. No model computes this and none needs to.
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

// "Which rooms keep coming back" — grouped by room, worst first.
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

// A maintenance phone's whole world: what is assigned to me and not done.
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

// Who is on the floor. The desk dispatches TO someone, and an empty assignee is
// a foreign key violation rather than an unassigned job — so the picker is a
// read, not a blank.
// ─── one person's own settings ───────────────────────────────
// How much of their screen the assistant may place. Read per run by the watcher
// rather than cached at login, so changing it takes effect on the next tick
// instead of the next session.
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
        // Empty is the real default, not a missing value: it means the persona
        // row decides. The fallback exists for a row read before the column did.
        assistant_model: { $get: { from: { $var: 'r' }, path: ['assistant_model'], fallback: { $const: '' } } },
      },
    },
  },
};

// Their OWN row and no other: the `staff` write behavior matches `id` against
// the caller's own principal, so a forged staffId updates nothing.
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

// Its own mutation rather than a second field on the one above: they are set by
// separate gestures, and a write that names one thing and does two is the kind
// of entry nobody can read back later. Same table, same personal write behavior,
// so it needs no grant the settings form did not already have.
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

// ─── the house, tonight ──────────────────────────────────────

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

// Every room at a property with its status, by number. One read serves the ops
// manager's inventory and the desk's "what can I actually sell" — the difference
// between them is which verb their surface offers, not which rows they see.
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
        // The tab, as the SET of statuses it means. It was a pair of bounds,
        // which happened to work only because 'clean' < 'dirty' < 'inspected' <
        // 'out_of_order' falls in a convenient alphabetical order — add a fifth
        // status tomorrow and whichever tab its name sorts into silently grows a
        // row. A set says what it means and cannot be moved by a spelling.
        { in: ['rooms.status', { $context: 'statuses' }] },
      ],
    },
    sort: [{ field: 'rooms.number', dir: 'asc' }],
    limit: 200,
  },
  // The row arrives READ, the way every other list's does: the cells are text and
  // a chip, so the sentence-building is here rather than in the layout.
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
        // What a clerk with somebody at the counter actually needs to know.
        sellable: { $eq: [{ $get: { from: { $var: 'r' }, path: ['status'] } }, 'inspected'] },
      },
    },
  },
};

// ONE room, by id — what a surface handed a stay loads to find out whether
// anybody can actually be put in it. `sellable` is the only field most callers
// read, and it is resolved here so no layout ever compares a status string.
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

// Rooms that could take a guest RIGHT NOW: inspected, and with nobody in them
// tonight. This is the read that makes a room move a two-tap gesture instead of
// a conversation — without it, "which rooms are free" is a question the app
// cannot answer and a clerk answers from memory.
//
// "Nobody is in it" is a NOT EXISTS over stays. It was briefly two reads —
// one returning the room ids that were spoken for, one filtering with `notIn`
// against them — because the grammar had no correlated subquery. It has one
// now, so the question is asked once and the set cannot change between halves.
//
// `inspected` rather than `clean` is deliberate and it is how hotels actually
// work: clean means housekeeping has finished, inspected means a supervisor has
// signed it off and it may be sold. Only the second one may be given to somebody
// standing at the counter.
//
// `kind` is an ILIKE so one entry serves both questions a move asks: '%' for
// anything at all, or the class the guest is already in when the move must not
// be a downgrade.
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
        // Not held by anybody in house or due in today. A room somebody is
        // walking into at half four is not free at four, however empty it looks.
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

// How many rooms are waiting on housekeeping. The desk's afternoon in one
// number, and the reason an arrival can be standing at the counter with nowhere
// to go while the house shows vacancies.
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

// ─── writes ──────────────────────────────────────────────────

// Raise an issue. `property_id` is NOT listed — the scope `set` behaviour stamps
// it from the caller's tenant on insert, so a guest cannot raise an issue into
// another hotel even by crafting the request. `stay_id` and `room_id` come from
// the session's stay.
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

// Dispatching work IS creating the task — the desk's "assign" button.
// `property_id` is stamped by scope, not sent.
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

// A job raised because a GUEST asked for something, not because something broke.
//
// The desk had no way to do this at all. A guest asking for two extra pillows
// and breakfast at ten produced a task nowhere: `tasks/dispatch` needs an issue,
// and an ask is not a fault. So the queue said a guest was waiting, and the only
// actions that touched a stay were reading, noting, moving or escalating it.
//
// Same table as a dispatch, same floor reads it. `issue_id` stays null and
// `stay_id` carries who it is for, which is the difference between "the lift is
// broken" and "room 510 would like more pillows".
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

// One write for every room-state change there is, because there is now one
// column. Ops takes a room out of service with it and the desk releases a turned
// room to a waiting arrival with it — the difference is which value the calling
// surface sends, and which surface the charter lets you hold.
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

// Moving a guest. The room is the only thing that changes; every charge, message
// and issue on the stay follows it because they hang off the STAY, which is the
// whole reason a move is one write rather than a migration.
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
