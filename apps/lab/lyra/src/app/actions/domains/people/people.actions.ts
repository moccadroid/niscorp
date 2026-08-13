import { z } from 'zod';
import type { ActionDefinition, Step } from '@niscorp/nova';
import { peopleListLayout, peopleDetailLayout, peopleFormLayout, peopleSignupLayout } from './people.layouts';
import { LENSES, ROLL_PAGE } from '@lyra/app/vex/member.entries';
import {
  peopleListPrism,
  peopleCountPrism,
  personByIdPrism,
  personUpdatePrism,
  memberSubscriptionPrism,
  personPassesPrism,
  startPlanPrism,
  recordPaymentPrism,
  endSubscriptionPrism,
  sellPassPrism,
  giveNoticePrism,
  withdrawNoticePrism,
  enrolPrism,
  enrollPrism,
  memberEnrolmentsPrism,
  openCoursesPrism,
  withdrawPrism,
  planOptionsPrism,
  passOptionsPrism,
} from './people.prism';

// A tab is a VALUE now. It used to carry the fingerprint pair its lens meant;
// the reads are one read taking `lens`, so the option carries the lens name and
// the request prism sends it like any other context.
const LENS_OPTIONS = LENSES.map((l) => ({ value: l.lens, label: l.label }));

// The last row of a just-arrived page, which is the next page's seek. Read off
// the PAGE (`$.more`) rather than off the appended list, because a `$prism`
// reads the batch's opening data: the appended `rows` is not visible yet in
// the same step list, and the page is.
const lastOf = (page: string, field: string) => ({
  $prism: { $get: { from: { $slice: { from: { $ref: page }, start: -1 } }, path: ['0', field], fallback: { $const: '' } } },
});

// Whether a full page came back. A short page is the end of the list; there is
// no count to compare against, and asking for one would be a second read that
// can disagree with the first.
const FULL_PAGE = (page: string) => ({ $prism: { $eq: [{ $length: { $ref: page } }, ROLL_PAGE] } });

// A fresh read: forget where we were. The seek is a position in a list that
// the new lens, search or write has just replaced.
const REWIND: Step[] = [
  { set: 'after', value: '' },
  { set: 'afterId', value: '' },
];

const AFTER_FIRST_PAGE: Step[] = [
  { set: 'after', value: lastOf('$.rows', 'person_name') },
  { set: 'afterId', value: lastOf('$.rows', 'person_id') },
  { set: 'hasMore', value: FULL_PAGE('$.rows') },
];

// ── the list ─────────────────────────────────────────────────
export const peopleListAction: ActionDefinition = {
  id: 'people.list',
  title: 'People',
  data: {
    rows: [],
    loading: true,
    // Which lens is on screen. One value, sent as context on both reads — which
    // is why there is no branch anywhere below.
    scope: 'current',
    scopes: LENS_OPTIONS,

    countRow: {},
    search: '',
    totalDisplay: '',

    // THE SEEK, and the page it produced. `after`/`afterId` are the last row
    // on screen — empty for a first page — and `more` is where the next page
    // lands before it is appended. Every fresh read (a lens, a keystroke, a
    // member changing) clears the seek first, because it is a position in a
    // list that no longer exists.
    after: '',
    afterId: '',
    more: [],
    hasMore: false,
  },
  layout: peopleListLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: peopleListPrism, target: 'rows' },
    // The SAME read, landing somewhere else: `more` is appended to `rows`
    // rather than replacing them.
    loadMore: { url: '/api/member/vex', method: 'POST', request: peopleListPrism, target: 'more' },
    count: { url: '/api/member/vex', method: 'POST', request: peopleCountPrism, target: 'countRow' },
  },
  lifecycle: {
    mount: [
      ...REWIND,
      { call: 'load', onSuccess: [{ set: 'loading', value: false }, ...AFTER_FIRST_PAGE] },
      { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] },
    ],
  },
  triggers: [
    { event: 'ui:click', ref: 'scope', do: [{ set: 'scope', value: '@event.payload.value' }, { set: 'loading', value: true }, ...REWIND, { call: 'load', onSuccess: [{ set: 'loading', value: false }, ...AFTER_FIRST_PAGE] }, { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] }] },

    // A row opens the record on top, so Back returns to the list — with the
    // lens it was showing, because the list instance was never unmounted.
    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'people.detail', canvas: 'sheet', with: ['sheet'], input: { personId: '@event.payload.person_id' } } }] },

    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'people.signup', canvas: 'sheet', with: ['sheet'] } }] },

    // Typing is the whole interaction — no search button.
    {
      event: 'ui:model',
      ref: 'search',
      do: [
        // The write lands FIRST: the read below reads `$.search`, and a `call`
        // before the `set` sends the previous keystroke's value.
        { set: 'search', value: '@event.payload' },
        ...REWIND,
        { call: 'load', onSuccess: AFTER_FIRST_PAGE },
        { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] },
      ],
    },

    // ONE MORE PAGE, appended. `rows` keeps what is already read and gains
    // what just arrived; the seek moves to the end of the new page.
    {
      event: 'ui:click',
      ref: 'more',
      do: [
        {
          call: 'loadMore',
          onSuccess: [
            { set: 'rows', value: { $prism: { $flatten: [{ $ref: '$.rows' }, { $ref: '$.more' }] } } },
            { set: 'after', value: lastOf('$.more', 'person_name') },
            { set: 'afterId', value: lastOf('$.more', 'person_id') },
            { set: 'hasMore', value: FULL_PAGE('$.more') },
          ],
        },
      ],
    },

    { message: 'members-changed', do: [...REWIND, { call: 'load', onSuccess: AFTER_FIRST_PAGE }, { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] }] },
  ],
};

export const peopleListInputSchema = z.toJSONSchema(
  z.object({
    scope: z.enum(['current', 'members', 'prospects', 'passes', 'course', 'staff', 'contacts', 'past', 'everyone']).optional().describe("Which lens to open on: 'current' is the working roll; the rest are relationship slices of the same list."),
  }),
);

// ── the record ───────────────────────────────────────────────
export const peopleDetailAction: ActionDefinition = {
  id: 'people.detail',
  title: 'Person',
  data: {
    personId: '',
    member: {},
    subscription: {},
    passes: [],
    planOptions: [],
    passOptions: [],
    courses: [],
    enrolments: [],
    courseId: '',
    enrolmentId: '',
    paidUntil: '',
    startOfferingId: '',
    startPaidVia: 'manual',
    sellOfferingId: '',
    sellPaidVia: 'manual',
    loading: true,
    error: '',
    hostId: 'people.detail',
    attachments: [],
    attachmentCount: 0,
  },
  layout: peopleDetailLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: personByIdPrism, target: 'member' },
    // Its own call, because it is its own question — and because the rung that
    // may read a subscription is not the rung that may read a name. A desk gets
    // nothing here and the section simply does not draw.
    subscription: { url: '/api/member/vex', method: 'POST', request: memberSubscriptionPrism, target: 'subscription' },
    passes: { url: '/api/member/vex', method: 'POST', request: personPassesPrism, target: 'passes' },
    planOptions: { url: '/api/member/vex', method: 'POST', request: planOptionsPrism, target: 'planOptions' },
    passOptions: { url: '/api/member/vex', method: 'POST', request: passOptionsPrism, target: 'passOptions' },
    startPlan: { url: '/api/member/vex', method: 'POST', request: startPlanPrism, errorTarget: 'error' },
    recordPayment: { url: '/api/member/vex', method: 'POST', request: recordPaymentPrism, errorTarget: 'error' },
    end: { url: '/api/member/vex', method: 'POST', request: endSubscriptionPrism, errorTarget: 'error' },
    sellPass: { url: '/api/member/vex', method: 'POST', request: sellPassPrism, errorTarget: 'error' },
    giveNotice: { url: '/api/member/vex', method: 'POST', request: giveNoticePrism, errorTarget: 'error' },
    withdrawNotice: { url: '/api/member/vex', method: 'POST', request: withdrawNoticePrism, errorTarget: 'error' },
    courses: { url: '/api/schedule/vex', method: 'POST', request: openCoursesPrism, target: 'courses' },
    enrolments: { url: '/api/schedule/vex', method: 'POST', request: memberEnrolmentsPrism, target: 'enrolments' },
    enrol: { url: '/api/schedule/vex', method: 'POST', request: enrolPrism, errorTarget: 'error' },
    withdraw: { url: '/api/schedule/vex', method: 'POST', request: withdrawPrism, errorTarget: 'error' },
    attachments: { fn: 'nav.attachments', target: 'attachments' },
  },
  lifecycle: {
    mount: [
      { call: 'courses' },
      { call: 'enrolments' },
      { call: 'attachments', onSuccess: [{ set: 'attachmentCount', value: { $prism: { $length: { $ref: '$.attachments' } } } }] },
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'subscription' },
      { call: 'passes' },
      { call: 'planOptions' },
      { call: 'passOptions' },
    ],
    // Coming back from the form: re-read rather than trust what was left
    // behind. The form may have written something this record has not seen.
    resume: [{ call: 'load' }, { call: 'subscription' }, { call: 'passes' }, { call: 'enrolments' }, { call: 'courses' }],
  },
  triggers: [
    { event: 'ui:click', ref: 'edit', do: [{ push: { action: 'people.form', canvas: 'sheet', with: ['sheet'], input: { personId: '$.personId' } } }] },

    // The implementation of the `attachable` declaration: the offered keys are
    // bound HERE, once, by the host, and a rider cannot reach past them.
    {
      event: 'ui:click',
      ref: 'openAttachment',
      do: [
        {
          push: {
            action: '@event.payload.action',
            canvas: 'sheet',
            with: ['sheet'],
            input: { person_id: '$.personId', person_name: '$.member.person_name' },
          },
        },
      ],
    },

    // Granting access, three shapes. Each write names the offering and the
    // record on screen; how it is paid rides along; nothing names a studio.
    {
      event: 'ui:click',
      ref: 'startPlan',
      do: [
        { set: 'error', value: '' },
        { call: 'startPlan', onSuccess: [{ call: 'subscription' }, { emit: { channel: 'members-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'recordPayment',
      do: [
        { set: 'error', value: '' },
        { call: 'recordPayment', onSuccess: [{ call: 'subscription' }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'sellPass',
      do: [
        { set: 'error', value: '' },
        { call: 'sellPass', onSuccess: [{ call: 'passes' }, { call: 'load' }, { emit: { channel: 'members-changed' } }] },
      ],
    },

    // Enrolling from the counter. The write names the course and the record on
    // screen; nothing in it names a human the screen does not already show.
    {
      event: 'ui:click',
      ref: 'enrol',
      do: [
        { set: 'error', value: '' },
        { set: 'courseId', value: '@event.payload.course_id' },
        { call: 'enrol', onSuccess: [{ call: 'enrolments' }, { call: 'courses' }, { emit: { channel: 'courses-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'withdraw',
      do: [
        { set: 'error', value: '' },
        { set: 'enrolmentId', value: '@event.payload.enrolment_id' },
        { call: 'withdraw', onSuccess: [{ call: 'enrolments' }, { call: 'courses' }, { emit: { channel: 'courses-changed' } }] },
      ],
    },
    // Giving notice is a DECISION, so it asks first — the same confirm sheet
    // every other consequential act here uses. Taking it back does not: undoing
    // a mistake should cost one click, not two.
    {
      event: 'ui:click',
      ref: 'giveNotice',
      do: [{ push: { action: 'confirm', canvas: 'sheet', with: ['sheet'], input: { title: 'Give notice?', message: 'Their leaving date is worked out from the notice period and any minimum term — whichever runs longer.', confirmLabel: 'Give notice', channel: 'notice-given' } } }],
    },
    { message: 'notice-given', do: [{ call: 'giveNotice', onSuccess: [{ call: 'subscription' }, { emit: { channel: 'members-changed' } }] }] },
    {
      event: 'ui:click',
      ref: 'withdrawNotice',
      do: [{ call: 'withdrawNotice', onSuccess: [{ call: 'subscription' }, { emit: { channel: 'members-changed' } }] }],
    },
    // Ending now is also a decision — same sheet, same rule.
    {
      event: 'ui:click',
      ref: 'end',
      do: [{ push: { action: 'confirm', canvas: 'sheet', with: ['sheet'], input: { title: 'End their subscription?', message: 'Ends it as of today, keeping the record. Coming back is a new start on today’s terms.', confirmLabel: 'End subscription', tone: 'danger', channel: 'subscription-ended' } } }],
    },
    { message: 'subscription-ended', do: [{ call: 'end', onSuccess: [{ call: 'load' }, { call: 'subscription' }, { emit: { channel: 'members-changed' } }] }] },
    { message: 'members-changed', do: [{ call: 'load' }] },
  ],
};

export const peopleDetailInputSchema = z.toJSONSchema(
  z.object({
    personId: z.string().describe('Which person to show. Scoped engine-side — an id from another studio resolves to nothing.'),
  }),
);

// ── the form ─────────────────────────────────────────────────
export const peopleFormAction: ActionDefinition = {
  id: 'people.form',
  title: 'Edit person',
  data: {
    personId: '',
    member: {},
    // The editable fields, held apart from `member` so a cancel is a pop and
    // not an undo.
    trialEndsOn: '',
    notes: '',
    saving: false,
    error: '',
  },
  layout: peopleFormLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: personByIdPrism, target: 'member' },
    save: { url: '/api/member/vex', method: 'POST', request: personUpdatePrism, errorTarget: 'error' },
  },
  lifecycle: {
    // The raw values travel alongside their display strings precisely so a
    // form can round-trip without re-parsing a translated label.
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'trialEndsOn', value: '$.member.trial_ends_on' },
          { set: 'notes', value: '$.member.notes' },
        ],
      },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        {
          call: 'save',
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'members-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
  ],
};

export const peopleFormInputSchema = z.toJSONSchema(
  z.object({
    personId: z.string().describe('The person being edited. Loaded bare, this form has nothing to edit.'),
  }),
);

// What the server function used to refuse with a thrown error, the form now
// refuses by never enabling the button: a blank name, or an address without
// an @. Recomputed as the fields are typed; `blocked` also holds the button
// down while a save is in flight.
const signupBlocked = {
  $prism: {
    $or: [
      { $eq: [{ $trim: { $ref: '$.newName' } }, ''] },
      { $not: { $contains: { value: { $ref: '$.newEmail' }, search: '@' } } },
    ],
  },
};

// ── writing somebody down ────────────────────────────────────
export const peopleSignupAction: ActionDefinition = {
  id: 'people.signup',
  title: 'New person',
  data: {
    newName: '',
    newEmail: '',
    newPhone: '',
    newTrialEndsOn: '',
    saving: false,
    blocked: true,
    error: '',
    // The confirmation. A kiosk stays on it and signs the next person up;
    // a desk reads it and goes back.
    done: false,
    signedUpName: '',
  },
  layout: peopleSignupLayout,
  // One replay, idempotent from every starting state — `people/enroll` ensures
  // the person and anchors them to the studio in a single transaction. Signing
  // up somebody already on the roll lands on the same done screen ("is on the
  // roll") without minting a duplicate — the DB arbitrates, not a lookup race.
  endpoints: { create: { url: '/api/member/vex', method: 'POST', request: enrollPrism, errorTarget: 'error' } },
  triggers: [
    // The first trigger writes the value; the SECOND re-answers "may this be
    // submitted yet". Two triggers, not two steps: buffered sets in one
    // trigger all resolve against the same pre-write snapshot, so a recompute
    // sharing the buffer would read the field as it was a keystroke ago.
    { event: 'ui:model', ref: 'newName', do: [{ set: 'newName', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newEmail', do: [{ set: 'newEmail', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newName', do: [{ set: 'blocked', value: signupBlocked }] },
    { event: 'ui:model', ref: 'newEmail', do: [{ set: 'blocked', value: signupBlocked }] },
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        { set: 'blocked', value: true },
        {
          call: 'create',
          // Captured BEFORE the fields are cleared: the steps run in order, and
          // reading it afterwards would confirm an empty string.
          onSuccess: [
            { set: 'saving', value: false },
            { set: 'signedUpName', value: '$.newName' },
            { set: 'done', value: true },
            { set: 'newName', value: '' },
            { set: 'newEmail', value: '' },
            { set: 'newPhone', value: '' },
            { set: 'newTrialEndsOn', value: '' },
            { emit: { channel: 'members-changed' } },
          ],
          onError: [{ set: 'saving', value: false }, { set: 'blocked', value: signupBlocked }],
        },
      ],
    },
    { event: 'ui:click', ref: 'again', do: [{ set: 'done', value: false }, { set: 'error', value: '' }] },
  ],
};

export const peopleSignupInputSchema = z.toJSONSchema(z.object({}));
