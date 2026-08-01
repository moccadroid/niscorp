import type { CacheEntry, MutationEntry } from './index';
import { dateText, money, roomStatusText, roomStatusTone, stampText, stateText, stateTone, statusTone } from '@atrium/app/prisms/format.prism';

// The reads a front desk actually works from, as opposed to the reads a database
// makes easy. Three of them exist because the same question kept being asked in
// four places and answered from memory: what is WAITING, who is DUE, and who is
// this person.

// ─── who is this ─────────────────────────────────────────────

// How many times they have stayed before. One number, and it is the difference
// between "good afternoon" and "welcome back". A COUNT over departed stays, so
// it cannot disagree with the history it is counting.
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

// The guest behind a stay, for a surface that was handed a stay and needs the
// person. `stay/byId` carries the reservation; this carries who it belongs to.
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
        // The clerk is about to pick up a telephone. A code is not what they
        // need to read, so the mapping spells it.
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

// ─── what the desk already knows ─────────────────────────────

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

// ─── what is waiting ─────────────────────────────────────────

// Threads where the guest spoke last. There is no window function and no HAVING
// in the query grammar, so the shape of the answer is built from what there IS:
// two conditional MAX aggregates per stay — the newest thing the guest said and
// the newest thing anybody here said — and the mapping keeps the rows where the
// first is later than the second.
//
// The desk's side falls back to the epoch rather than to null on purpose. A
// thread nobody has ever answered is the most important row in this list, and
// null would have made it the one row the comparison could not rank.
//
// The shape carries no message body: a grouped query cannot also return one
// row's text, and a field that ships empty on every row is worse than an absent
// one — it reaches the assistant's prompt and refuses to say what a guest asked.
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
        // A guest who has gone home is not waiting for an answer. Without this
        // the top of the list is whoever said "thank you" on their way out,
        // which is the fastest way to teach a clerk to stop reading it.
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
              // A bare "9" under a guest's name reads as a count, a score or a
              // typo. Rows print what the mapping hands them, so the word
              // belongs here.
              room_display: { $join: { parts: ['Room ', { $get: { from: { $var: 'r' }, path: ['room_number'], fallback: { $const: '—' } } }], sep: '' } },
              asked_at: { $get: { from: { $var: 'r' }, path: ['guest_last'] } },
              asked_display: stampText({ $get: { from: { $var: 'r' }, path: ['guest_last'] } }),
              // Internal, projected away below. Only its SIGN is meaningful:
              // the desk's side is the epoch when nobody has ever replied, so
              // the magnitude is minutes since 1970 rather than a wait.
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
      // Longest wait first, and the sort key is WHEN THEY SPOKE rather than how
      // far ahead of the desk they are. Those look like the same ordering and
      // are not: a thread nobody has ever answered has an epoch on the desk's
      // side, so ranking by the gap puts every never-answered thread above
      // every slowly-answered one regardless of the hour. Ordering by the
      // guest's own timestamp asks the only question a clerk has — who has been
      // waiting longest — and needs no clock at all.
      // Filter, sort, then PROJECT — the last step drops `ahead`, so the working
      // field never reaches a caller or a prompt.
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

// Open issues with nobody on them, oldest first. This is the read that turns a
// board of twelve into the two that are actually somebody's problem right now —
// and "oldest first" rather than "worst first" is deliberate: severity is what
// somebody typed when they raised it, and age is a fact.
//
// "Nobody has been sent" is a NOT EXISTS, which is what it is in English. It
// was briefly two reads — one returning the ids of issues that had tasks, one
// filtering with `notIn` against them — because vex had no correlated subquery
// and a left join to tasks was being flattened by the scope layer. Both of
// those are fixed, so the question is asked once, in the shape it has.
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

// ─── who is due ──────────────────────────────────────────────

// Arrivals that have not checked in, with the state of the room they are booked
// into. The join is the point: "arriving at half four" and "that room is still
// dirty" are two facts nobody had in one place, and together they are the
// afternoon's only real decision.
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
        // The only question the counter is asking.
        ready: { $eq: [{ $get: { from: { $var: 'r' }, path: ['room_status'], fallback: { $const: '' } } }, 'inspected'] },
        eta: { $get: { from: { $var: 'r' }, path: ['eta'], fallback: { $const: '' } } },
        adults: { $get: { from: { $var: 'r' }, path: ['adults'], fallback: { $const: 1 } } },
        group_id: { $get: { from: { $var: 'r' }, path: ['group_id'], fallback: { $const: '' } } },
      },
    },
  },
};

// One block, and the state of every room in it.
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

// The members of a block who can actually be checked in right now: on the
// group, not yet checked in, and standing in a room somebody has signed off.
// A flat array of stay ids, because that is what the write below consumes.
//
// This is how a batch gesture happens without a loop anywhere. Nova triggers do
// not iterate and layouts do not filter, so "check in everybody whose room is
// ready" is expressed as a QUERY that knows who those people are and a write
// that takes a set — and the rule about not checking somebody into a room that
// is still dirty lives in SQL, where it cannot be forgotten by a caller.
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

// ─── the shift note ──────────────────────────────────────────

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

// ─── the movements list, filtered ────────────────────────────

// One list of everybody moving today, with the room state beside them and a
// STATE RANGE for the tab. It replaces two surfaces that read the same query:
// an arrivals list, and a key-cutting tool whose only way to find a guest was to
// type their name into a search box.
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
        // The tab, as the SET of states it means.
        //
        // This was a pair of bounds over the state text — the same range trick
        // the issue board's tabs use — and it was wrong in a way that returned
        // results instead of an error. Stay states sort 'arriving' < 'booked' <
        // 'departed' < 'in_house', so a range from the first live state to the
        // last swallows every departed stay in the history, and a property with
        // four months behind it answers with sixty strangers from April while
        // today's arrivals fall off the limit. Patching it with a `neq` fixed
        // the symptom and kept the cause.
        //
        // A range asks "between these two in alphabetical order", which is a
        // question nobody has. `in` asks the question somebody actually has,
        // needs no exclusion beside it, and cannot be broken by adding a state
        // whose name happens to sort in the middle. Still one cached plan: a
        // context array compiles to a single parameterized `= ANY($n)`.
        { in: ['stays.state', { $context: 'states' }] },
      ],
    },
    // Arrivals lead, because they are the ones standing in front of somebody.
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

// ─── the goodwill gesture ────────────────────────────────────
// Posting one is `folio/post` with a negative amount and `messages/send` with
// the apology — both core writes the desk already holds. What is NOT here is a
// mutation that invents a figure: the amount always arrives from a
// connector-shipped option row, which is the only reason a machine is allowed
// to choose one at all.
//
// This read is the record: every gesture given on a stay, so the brief can say
// "we have already comped a dinner" before somebody comps another.
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
        // Gestures are posted with a marked description, so the record of them
        // is a read over the folio rather than a second table telling a story
        // the bill already tells.
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

// ─── escalation ──────────────────────────────────────────────
// A hand-off to a named human, as a task. Not a new table and not a new channel:
// a task IS "somebody must do this", it already carries an assignee and a
// status, and the only thing it was missing was room for a sentence.
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

// Front-office work that has been handed to somebody and not yet picked up. The
// receiving end of an escalation, and one of the rows on the stall list — an
// escalation nobody can see is a message thrown over a wall.
// NO ROOMS JOIN, and that is load-bearing rather than an omission. An
// escalation is about a person or a situation and usually has no room at all —
// and joins here are INNER, so naming `rooms` would silently drop exactly the
// rows this read exists to return. The stay is the context it carries instead.
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
