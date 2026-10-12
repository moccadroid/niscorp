import type { CacheEntry, MutationEntry } from './index';
import { dateText, money, roomStatusText, roomStatusTone, stampText, stateText, stateTone, statusTone } from '@atrium/app/prisms/format.prism';

export const stayVisitCount: CacheEntry = {
  fingerprint: 'stays/visitCount',
  intent: 'How many completed stays a guest has had at this property',
  shape: { count: 0 },
  dsl: {
    from: ['stays'],
    aggregate: { count: { count: '*' } },
    filter: { and: [{ eq: ['stays.guest_id', { $context: 'guestId' }] }, { eq: ['stays.state', 'departed'] }] },
  },
  mapping: { $ref: '$.result' },
};

export const guestForStay: CacheEntry = {
  fingerprint: 'guests/forStay',
  intent: 'The guest on a stay, with tier and language',
  shape: { guest_id: '', name: '', email: '', tier: '', language: '', language_display: '' },
  dsl: {
    from: ['stays', 'guests'],
    fields: [{ field: 'guests.id', as: 'guest_id' }, 'guests.name', 'guests.email', 'guests.tier', 'guests.language'],
    filter: { eq: ['stays.id', { $context: 'stayId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        guest_id: { $get: { from: { $var: 'r' }, path: ['guest_id'], fallback: { $const: '' } } },
        name: { $get: { from: { $var: 'r' }, path: ['name'], fallback: { $const: '' } } },
        email: { $get: { from: { $var: 'r' }, path: ['email'], fallback: { $const: '' } } },
        tier: { $get: { from: { $var: 'r' }, path: ['tier'], fallback: { $const: '' } } },
        language: { $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } },
        language_display: {
          $case: {
            branches: [
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'de'] }, then: 'German' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'es'] }, then: 'Spanish' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'fr'] }, then: 'French' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'it'] }, then: 'Italian' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'da'] }, then: 'Danish' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'sv'] }, then: 'Swedish' },
              { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['language'], fallback: { $const: '' } } }, 'ja'] }, then: 'Japanese' },
            ],
            else: 'English',
          },
        },
      },
    },
  },
};

export const notesForStay: CacheEntry = {
  fingerprint: 'notes/forStay',
  intent: 'Desk notes on a stay, newest first',
  shape: [{ note_id: '', kind: '', body: '', author: '', created_display: '' }],
  dsl: {
    from: ['stay_notes'],
    fields: [{ field: 'stay_notes.id', as: 'note_id' }, 'stay_notes.kind', 'stay_notes.body', 'stay_notes.author', 'stay_notes.created_at'],
    filter: { eq: ['stay_notes.stay_id', { $context: 'stayId' }] },
    sort: [{ field: 'stay_notes.created_at', dir: 'desc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        note_id: { $get: { from: { $var: 'r' }, path: ['note_id'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        author: { $get: { from: { $var: 'r' }, path: ['author'] } },
        created_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

export const noteAdd: MutationEntry = {
  fingerprint: 'notes/add',
  intent: 'Write a desk note against a stay',
  mutation: {
    op: 'insert',
    table: 'stay_notes',
    values: { stay_id: { $context: 'stayId' }, kind: { $context: 'kind' }, body: { $context: 'body' }, author: { $context: 'author' } },
  },
};

// The query grammar has no window function and no HAVING, so the mapping keeps
// the rows where the guest's newest message is later than the desk's. The
// desk's side falls back to the epoch, not null: a thread nobody has answered
// must still compare as waiting.
export const messagesWaiting: CacheEntry = {
  fingerprint: 'messages/waiting',
  intent: 'Stays whose most recent message is from the guest — nobody here has answered yet',
  shape: [{ stay_id: '', guest_name: '', room_number: '', room_display: '', asked_at: '', asked_display: '' }],
  dsl: {
    from: ['messages', 'stays', 'guests', 'rooms'],
    fields: [
      'messages.stay_id',
      { field: 'guests.name', as: 'guest_name' },
      { field: 'rooms.number', as: 'room_number' },
    ],
    aggregate: {
      guest_last: { max: { case: { when: [{ condition: { eq: ['messages.sender', 'guest'] }, then: 'messages.sent_at' }], else: '1970-01-01' } } },
      staff_last: { max: { case: { when: [{ condition: { neq: ['messages.sender', 'guest'] }, then: 'messages.sent_at' }], else: '1970-01-01' } } },
    },
    filter: {
      and: [
        { eq: ['messages.property_id', { $context: 'propertyId' }] },
        { neq: ['stays.state', 'departed'] },
      ],
    },
    groupBy: ['messages.stay_id', 'guests.name', 'rooms.number'],
    limit: 80,
  },
  mapping: {
    $with: {
      let: {
        rows: {
          $map: {
            over: { $ref: '$.result' },
            as: 'r',
            body: {
              stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
              guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
              room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
              room_display: { $join: { parts: ['Room ', { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '—' } } }], sep: '' } },
              asked_at: { $get: { from: { $var: 'r' }, path: ['guest_last'] } },
              asked_display: stampText({ $get: { from: { $var: 'r' }, path: ['guest_last'] } }),
              // Only the sign is meaningful: the desk's side is the epoch when
              // nobody has replied, so the magnitude is not a wait.
              ahead: {
                $dateDiff: {
                  unit: 'minute',
                  from: { $get: { from: { $var: 'r' }, path: ['staff_last'] } },
                  to: { $get: { from: { $var: 'r' }, path: ['guest_last'] } },
                },
              },
            },
          },
        },
      },
      value: {
        $map: {
          over: {
            $sortBy: {
              over: { $filter: { over: { $var: 'rows' }, as: 'r', when: { $gt: [{ $get: { from: { $var: 'r' }, path: ['ahead'] } }, 0] } } },
              as: 'r',
              by: { $get: { from: { $var: 'r' }, path: ['asked_at'] } },
              dir: 'asc',
            },
          },
          as: 'r',
          body: {
            stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
            guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
            room_number: { $get: { from: { $var: 'r' }, path: ['room_number'] } },
            room_display: { $get: { from: { $var: 'r' }, path: ['room_display'] } },
            asked_at: { $get: { from: { $var: 'r' }, path: ['asked_at'] } },
            asked_display: { $get: { from: { $var: 'r' }, path: ['asked_display'] } },
          },
        },
      },
    },
  },
};

export const issuesUnattended: CacheEntry = {
  fingerprint: 'issues/unattended',
  intent: 'Open issues at a property with no task dispatched, oldest first',
  shape: [{ issue_id: '', summary: '', kind: '', severity: '', severity_tone: '', room_number: '', room_display: '', raised_display: '', stay_id: '' }],
  dsl: {
    from: ['issues', 'rooms'],
    fields: [
      { field: 'issues.id', as: 'issue_id' },
      'issues.summary',
      'issues.kind',
      'issues.severity',
      'issues.raised_at',
      'issues.stay_id',
      { field: 'rooms.number', as: 'room_number' },
    ],
    filter: {
      and: [
        { eq: ['issues.property_id', { $context: 'propertyId' }] },
        { eq: ['issues.status', 'open'] },
        { not: { exists: { from: ['tasks'], filter: { eq: ['tasks.issue_id', 'issues.id'] } } } },
      ],
    },
    sort: [{ field: 'issues.raised_at', dir: 'asc' }],
    limit: 40,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        issue_id: { $get: { from: { $var: 'r' }, path: ['issue_id'] } },
        summary: { $get: { from: { $var: 'r' }, path: ['summary'] } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'] } },
        severity: { $get: { from: { $var: 'r' }, path: ['severity'] } },
        severity_tone: { $case: { branches: [{ when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['severity'] } }, 'high'] }, then: 'alert' }, { when: { $eq: [{ $get: { from: { $var: 'r' }, path: ['severity'] } }, 'normal'] }, then: 'warn' }], else: 'neutral' } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '' } } },
        room_display: { $join: { parts: ['Room ', { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '—' } } }], sep: '' } },
        raised_display: stampText({ $get: { from: { $var: 'r' }, path: ['raised_at'] } }),
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'], fallback: { $const: '' } } },
      },
    },
  },
};

export const staysDueIn: CacheEntry = {
  fingerprint: 'stays/dueIn',
  intent: 'Stays arriving today that have not checked in, with their room status and ETA',
  shape: [{ stay_id: '', guest_name: '', tier: '', room_id: '', room_number: '', room_kind: '', room_status: '', room_state: '', room_state_tone: '', ready: false, eta: '', adults: 0, group_id: '' }],
  dsl: {
    from: ['stays', 'guests', 'rooms'],
    fields: [
      { field: 'stays.id', as: 'stay_id' },
      { field: 'guests.name', as: 'guest_name' },
      'guests.tier',
      { field: 'stays.room_id', as: 'room_id' },
      'stays.eta',
      'stays.adults',
      'stays.group_id',
      { field: 'rooms.number', as: 'room_number' },
      { field: 'rooms.kind', as: 'room_kind' },
      { field: 'rooms.status', as: 'room_status' },
    ],
    filter: { and: [{ eq: ['stays.property_id', { $context: 'propertyId' }] }, { eq: ['stays.state', 'arriving'] }, { eq: ['stays.checked_in', false] }] },
    sort: [{ field: 'stays.eta', dir: 'asc' }],
    limit: 60,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        tier: { $get: { from: { $var: 'r' }, path: ['tier'] } },
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'], fallback: { $const: '' } } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '' } } },
        room_kind: { $get: { from: { $var: 'r' }, path: ['room_kind'], fallback: { $const: '' } } },
        room_status: { $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } },
        room_state: roomStatusText({ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }),
        room_state_tone: roomStatusTone({ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }),
        ready: { $eq: [{ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }, 'inspected'] },
        eta: { $get: { from: { $var: 'r' }, path: ['eta'], fallback: { $const: '' } } },
        adults: { $get: { from: { $var: 'r' }, path: ['adults'], fallback: { $const: 1 } } },
        group_id: { $get: { from: { $var: 'r' }, path: ['group_id'], fallback: { $const: '' } } },
      },
    },
  },
};

export const staysInGroup: CacheEntry = {
  fingerprint: 'stays/inGroup',
  intent: 'Every stay on one group booking, with room status and check-in state',
  shape: [{ stay_id: '', guest_name: '', room_id: '', room_number: '', room_status: '', room_state: '', room_state_tone: '', ready: false, checked_in: false, key_issued: false, eta: '' }],
  dsl: {
    from: ['stays', 'guests', 'rooms'],
    fields: [
      { field: 'stays.id', as: 'stay_id' },
      { field: 'guests.name', as: 'guest_name' },
      { field: 'stays.room_id', as: 'room_id' },
      'stays.checked_in',
      'stays.key_issued',
      'stays.eta',
      { field: 'rooms.number', as: 'room_number' },
      { field: 'rooms.status', as: 'room_status' },
    ],
    filter: { eq: ['stays.group_id', { $context: 'groupId' }] },
    sort: [{ field: 'rooms.number', dir: 'asc' }],
    limit: 40,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'], fallback: { $const: '' } } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '' } } },
        room_status: { $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } },
        room_state: roomStatusText({ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }),
        room_state_tone: roomStatusTone({ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }),
        ready: { $eq: [{ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }, 'inspected'] },
        checked_in: { $get: { from: { $var: 'r' }, path: ['checked_in'], fallback: { $const: false } } },
        key_issued: { $get: { from: { $var: 'r' }, path: ['key_issued'], fallback: { $const: false } } },
        eta: { $get: { from: { $var: 'r' }, path: ['eta'], fallback: { $const: '' } } },
      },
    },
  },
};

export const staysInGroupReady: CacheEntry = {
  fingerprint: 'stays/inGroupReady',
  intent: 'Stay ids on a group booking whose room is signed off and who have not checked in',
  shape: [''],
  dsl: {
    from: ['stays', 'rooms'],
    fields: [{ field: 'stays.id', as: 'stay_id' }],
    filter: {
      and: [
        { eq: ['stays.group_id', { $context: 'groupId' }] },
        { eq: ['stays.checked_in', false] },
        { eq: ['rooms.status', 'inspected'] },
      ],
    },
    limit: 40,
  },
  mapping: { $map: { over: { $ref: '$.result' }, as: 'r', body: { $get: { from: { $var: 'r' }, path: ['stay_id'] } } } },
};

export const stayCheckInMany: MutationEntry = {
  fingerprint: 'stays/checkInMany',
  intent: 'Check in every stay in a set',
  mutation: {
    op: 'update',
    table: 'stays',
    set: { checked_in: true, state: 'in_house' },
    where: { in: ['stays.id', { $context: 'stayIds' }] },
  },
};

export const groupById: CacheEntry = {
  fingerprint: 'groups/byId',
  intent: 'One group booking',
  shape: { group_id: '', label: '', kind: '', note: '' },
  dsl: {
    from: ['stay_groups'],
    fields: [{ field: 'stay_groups.id', as: 'group_id' }, 'stay_groups.label', 'stay_groups.kind', 'stay_groups.note'],
    filter: { eq: ['stay_groups.id', { $context: 'groupId' }] },
    limit: 1,
  },
  mapping: {
    $with: {
      let: { r: { $ref: '$.result' } },
      value: {
        group_id: { $get: { from: { $var: 'r' }, path: ['group_id'], fallback: { $const: '' } } },
        label: { $get: { from: { $var: 'r' }, path: ['label'], fallback: { $const: '' } } },
        kind: { $get: { from: { $var: 'r' }, path: ['kind'], fallback: { $const: '' } } },
        note: { $get: { from: { $var: 'r' }, path: ['note'], fallback: { $const: '' } } },
      },
    },
  },
};

export const handoversRecent: CacheEntry = {
  fingerprint: 'handovers/recent',
  intent: 'The last few shift handovers at a property, newest first',
  shape: [{ handover_id: '', shift: '', body: '', author_name: '', created_display: '' }],
  dsl: {
    from: ['handovers', 'staff'],
    fields: [{ field: 'handovers.id', as: 'handover_id' }, 'handovers.shift', 'handovers.body', 'handovers.created_at', { field: 'staff.name', as: 'author_name' }],
    filter: { eq: ['handovers.property_id', { $context: 'propertyId' }] },
    sort: [{ field: 'handovers.created_at', dir: 'desc' }],
    limit: 5,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        handover_id: { $get: { from: { $var: 'r' }, path: ['handover_id'] } },
        shift: { $get: { from: { $var: 'r' }, path: ['shift'] } },
        body: { $get: { from: { $var: 'r' }, path: ['body'] } },
        author_name: { $get: { from: { $var: 'r' }, path: ['author_name'], fallback: { $const: '' } } },
        created_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};

export const handoverWrite: MutationEntry = {
  fingerprint: 'handovers/write',
  intent: 'Leave the shift handover note',
  mutation: {
    op: 'insert',
    table: 'handovers',
    values: { author_id: { $context: 'authorId' }, shift: { $context: 'shift' }, body: { $context: 'body' } },
  },
};

export const staysMovementsToday: CacheEntry = {
  fingerprint: 'stays/movementsToday',
  intent: 'Stays at a property arriving or departing today, or in house, with room status',
  shape: [
    { stay_id: '', guest_name: '', tier: '', room_id: '', room_number: '', room_status: '', room_state: '', room_state_tone: '', ready: false, arrival_display: '', departure_display: '', state: '', state_text: '', state_tone: '', checked_in: false, key_issued: false, eta: '', group_id: '' },
  ],
  dsl: {
    from: ['stays', 'guests', 'rooms'],
    fields: [
      { field: 'stays.id', as: 'stay_id' },
      { field: 'guests.name', as: 'guest_name' },
      'guests.tier',
      { field: 'stays.room_id', as: 'room_id' },
      'stays.arrival',
      'stays.departure',
      'stays.eta',
      'stays.state',
      'stays.checked_in',
      'stays.key_issued',
      'stays.group_id',
      { field: 'rooms.number', as: 'room_number' },
      { field: 'rooms.status', as: 'room_status' },
    ],
    filter: {
      and: [
        { eq: ['stays.property_id', { $context: 'propertyId' }] },
        { ilike: ['guests.name', { $context: 'q' }] },
        // A set, not the range the issue board's tabs use: stay states sort
        // 'arriving' < 'booked' < 'departed' < 'in_house', so a range over the
        // live states takes in every departed stay.
        { in: ['stays.state', { $context: 'states' }] },
      ],
    },
    sort: [
      { field: 'stays.state', dir: 'asc' },
      { field: 'stays.eta', dir: 'asc' },
      { field: 'stays.arrival', dir: 'asc' },
    ],
    limit: 80,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'] } },
        guest_name: { $get: { from: { $var: 'r' }, path: ['guest_name'] } },
        tier: { $get: { from: { $var: 'r' }, path: ['tier'] } },
        room_id: { $get: { from: { $var: 'r' }, path: ['room_id'], fallback: { $const: '' } } },
        room_number: { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '' } } },
        room_status: { $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } },
        room_state: roomStatusText({ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }),
        room_state_tone: roomStatusTone({ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }),
        ready: { $eq: [{ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }, 'inspected'] },
        arrival_display: dateText({ $get: { from: { $var: 'r' }, path: ['arrival'] } }),
        departure_display: dateText({ $get: { from: { $var: 'r' }, path: ['departure'] } }),
        state: { $get: { from: { $var: 'r' }, path: ['state'] } },
        state_text: stateText({ $get: { from: { $var: 'r' }, path: ['state'] } }),
        state_tone: stateTone({ $get: { from: { $var: 'r' }, path: ['state'] } }),
        checked_in: { $get: { from: { $var: 'r' }, path: ['checked_in'] } },
        key_issued: { $get: { from: { $var: 'r' }, path: ['key_issued'] } },
        eta: { $get: { from: { $var: 'r' }, path: ['eta'], fallback: { $const: '' } } },
        group_id: { $get: { from: { $var: 'r' }, path: ['group_id'], fallback: { $const: '' } } },
      },
    },
  },
};

export const goodwillForStay: CacheEntry = {
  fingerprint: 'goodwill/forStay',
  intent: 'Goodwill gestures already given on a stay',
  shape: [{ line_id: '', description: '', amount: 0, amount_display: '', posted_display: '' }],
  dsl: {
    from: ['folio_lines'],
    fields: [{ field: 'folio_lines.id', as: 'line_id' }, 'folio_lines.description', 'folio_lines.amount', 'folio_lines.posted_at'],
    filter: {
      and: [
        { eq: ['folio_lines.stay_id', { $context: 'stayId' }] },
        { isNull: 'folio_lines.voided_at' },
        { like: ['folio_lines.description', 'Goodwill%'] },
      ],
    },
    sort: [{ field: 'folio_lines.posted_at', dir: 'desc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        line_id: { $get: { from: { $var: 'r' }, path: ['line_id'] } },
        description: { $get: { from: { $var: 'r' }, path: ['description'] } },
        amount: { $get: { from: { $var: 'r' }, path: ['amount'] } },
        amount_display: money({ $get: { from: { $var: 'r' }, path: ['amount'] } }),
        posted_display: stampText({ $get: { from: { $var: 'r' }, path: ['posted_at'] } }),
      },
    },
  },
};

export const escalationRaise: MutationEntry = {
  fingerprint: 'tasks/escalate',
  intent: 'Hand something to a named colleague, with the reason',
  mutation: {
    op: 'insert',
    table: 'tasks',
    values: {
      stay_id: { $context: 'stayId' },
      issue_id: { $context: 'issueId' },
      room_id: { $context: 'roomId' },
      title: { $context: 'title' },
      detail: { $context: 'detail' },
      kind: 'front-office',
      assignee_id: { $context: 'assigneeId' },
    },
  },
};

export const tasksFrontOffice: CacheEntry = {
  fingerprint: 'tasks/frontOffice',
  intent: 'Open front-office tasks at a property with who they are for',
  shape: [{ task_id: '', title: '', detail: '', status: '', status_tone: '', assignee_name: '', stay_id: '', created_display: '' }],
  dsl: {
    from: ['tasks', 'staff'],
    fields: [
      { field: 'tasks.id', as: 'task_id' },
      'tasks.title',
      'tasks.detail',
      'tasks.status',
      'tasks.stay_id',
      'tasks.created_at',
      { field: 'staff.name', as: 'assignee_name' },
    ],
    filter: { and: [{ eq: ['tasks.property_id', { $context: 'propertyId' }] }, { eq: ['tasks.kind', 'front-office'] }, { eq: ['tasks.status', 'open'] }] },
    sort: [{ field: 'tasks.created_at', dir: 'asc' }],
    limit: 20,
  },
  mapping: {
    $map: {
      over: { $ref: '$.result' },
      as: 'r',
      body: {
        task_id: { $get: { from: { $var: 'r' }, path: ['task_id'] } },
        title: { $get: { from: { $var: 'r' }, path: ['title'] } },
        detail: { $get: { from: { $var: 'r' }, path: ['detail'], fallback: { $const: '' } } },
        status: { $get: { from: { $var: 'r' }, path: ['status'] } },
        status_tone: statusTone({ $get: { from: { $var: 'r' }, path: ['status'] } }),
        assignee_name: { $get: { from: { $var: 'r' }, path: ['assignee_name'], fallback: { $const: 'nobody yet' } } },
        stay_id: { $get: { from: { $var: 'r' }, path: ['stay_id'], fallback: { $const: '' } } },
        created_display: stampText({ $get: { from: { $var: 'r' }, path: ['created_at'] } }),
      },
    },
  },
};
