import { z } from 'zod';
import type { ActionDefinition, Step } from '@niscorp/nova';
import { peopleListLayout, peopleDetailLayout, peopleFormLayout, peopleSignupLayout } from './people.layouts';
import { HOLDINGS, LENSES, ROLL_PAGE, ROLL_ORDERS } from '@lyra/app/vex/member.entries';

const DEFAULT_ORDER = ROLL_ORDERS[0]!;
const DEFAULT_ROW_KEY = DEFAULT_ORDER.rowKey;
import {
  attachChildPrism,
  createChildPrism,
  endSubscriptionPrism,
  enrolPrism,
  enrollPrism,
  findSignedUpPrism,
  startAtSignupPrism,
  giveNoticePrism,
  memberEnrolmentsPrism,
  memberSubscriptionPrism,
  openCoursesPrism,
  passOptionsPrism,
  peopleCountPrism,
  peopleListPrism,
  personByIdPrism,
  personFamilyPrism,
  personPassesPrism,
  personPurchasesPrism,
  personUpdatePrism,
  planOptionsPrism,
  recordPaymentPrism,
  sellPassPrism,
  startPlanPrism,
  withdrawNoticePrism,
  withdrawPrism,
} from './people.prism';

const LENS_OPTIONS = LENSES.map((l) => ({ value: l.lens, label: l.label }));
const HOLDING_OPTIONS = HOLDINGS.map((h) => ({ value: h.holding, label: h.label }));

// Read off the page (`$.more`), not the appended list: a `$prism` reads the
// data as it stood before the run of sets, where `rows` is not yet appended.
const lastOf = (page: string, field: string) => ({
  $prism: { $get: { from: { $slice: { from: { $ref: page }, start: -1 } }, path: ['0', field], fallback: { $const: '' } } },
});

const FULL_PAGE = (page: string) => ({ $prism: { $eq: [{ $length: { $ref: page } }, ROLL_PAGE] } });

const CURSOR_VALUE = (page: string) => ({
  $prism: {
    $case: {
      branches: ROLL_ORDERS.filter((o) => o.rowKey !== DEFAULT_ROW_KEY).map((o) => ({
        when: { $eq: [{ $ref: '$.sortBy' }, o.field] },
        then: { $get: { from: { $slice: { from: { $ref: page }, start: -1 } }, path: ['0', o.rowKey], fallback: { $const: '' } } },
      })),
      else: { $get: { from: { $slice: { from: { $ref: page }, start: -1 } }, path: ['0', DEFAULT_ROW_KEY], fallback: { $const: '' } } },
    },
  },
});

const REWIND: Step[] = [
  { set: 'after', value: '' },
  { set: 'afterId', value: '' },
];

const AFTER_FIRST_PAGE: Step[] = [
  { set: 'after', value: CURSOR_VALUE('$.rows') },
  { set: 'afterId', value: lastOf('$.rows', 'person_id') },
  { set: 'hasMore', value: FULL_PAGE('$.rows') },
];

export const peopleListAction: ActionDefinition = {
  id: 'people.list',
  title: 'People',
  data: {
    rows: [],
    loading: true,
    scope: 'current',
    scopes: LENS_OPTIONS,
    holdings: HOLDING_OPTIONS,
    holding: 'any',

    countRow: {},
    search: '',
    totalDisplay: '',

    after: '',
    afterId: '',
    more: [],
    hasMore: false,

    sortBy: DEFAULT_ORDER.field,
    sortDir: DEFAULT_ORDER.dir,
  },
  layout: peopleListLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: peopleListPrism, target: 'rows' },
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

    { event: 'ui:model', ref: 'holding', do: [{ set: 'holding', value: '@event.payload' }, { set: 'loading', value: true }, ...REWIND, { call: 'load', onSuccess: [{ set: 'loading', value: false }, ...AFTER_FIRST_PAGE] }, { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] }] },

    {
      event: 'ui:click',
      ref: 'sort',
      do: [
        { set: 'sortBy', value: '@event.payload.key' },
        { set: 'sortDir', value: '@event.payload.dir' },
        ...REWIND,
        { call: 'load', onSuccess: AFTER_FIRST_PAGE },
      ],
    },

    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'people.detail', canvas: 'sheet', with: ['sheet'], input: { personId: '@event.payload.person_id' } } }] },

    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'people.signup', canvas: 'sheet', with: ['sheet'] } }] },

    {
      event: 'ui:model',
      ref: 'search',
      do: [
        { set: 'search', value: '@event.payload' },
        ...REWIND,
        { call: 'load', onSuccess: AFTER_FIRST_PAGE },
        { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] },
      ],
    },

    {
      event: 'ui:click',
      ref: 'more',
      do: [
        {
          call: 'loadMore',
          onSuccess: [
            { set: 'rows', value: { $prism: { $flatten: [{ $ref: '$.rows' }, { $ref: '$.more' }] } } },
            { set: 'after', value: CURSOR_VALUE('$.more') },
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

export const peopleDetailAction: ActionDefinition = {
  id: 'people.detail',
  title: 'Person',
  data: {
    personId: '',
    member: {},
    subscription: {},
    passes: [],
    purchases: [],
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
    family: [],
    newChild: {},
    childName: '',
    childBornOn: '',
    addingChild: false,
  },
  layout: peopleDetailLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: personByIdPrism, target: 'member' },
    subscription: { url: '/api/member/vex', method: 'POST', request: memberSubscriptionPrism, target: 'subscription' },
    passes: { url: '/api/member/vex', method: 'POST', request: personPassesPrism, target: 'passes' },
    purchases: { url: '/api/member/vex', method: 'POST', request: personPurchasesPrism, target: 'purchases' },
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
    family: { url: '/api/member/vex', method: 'POST', request: personFamilyPrism, target: 'family' },
    createChild: { url: '/api/member/vex', method: 'POST', request: createChildPrism, target: 'newChild', errorTarget: 'error' },
    attachChild: { url: '/api/member/vex', method: 'POST', request: attachChildPrism, errorTarget: 'error' },
  },
  lifecycle: {
    mount: [
      { call: 'courses' },
      { call: 'enrolments' },
      { call: 'attachments', onSuccess: [{ set: 'attachmentCount', value: { $prism: { $length: { $ref: '$.attachments' } } } }] },
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'subscription' },
      { call: 'passes' },
      { call: 'purchases' },
      { call: 'planOptions' },
      { call: 'passOptions' },
      { call: 'family' },
    ],
    resume: [{ call: 'load' }, { call: 'subscription' }, { call: 'passes' }, { call: 'purchases' }, { call: 'enrolments' }, { call: 'courses' }, { call: 'family' }],
  },
  triggers: [
    { event: 'ui:click', ref: 'edit', do: [{ push: { action: 'people.form', canvas: 'sheet', with: ['sheet'], input: { personId: '$.personId' } } }] },

    { event: 'ui:click', ref: 'addChild', do: [{ set: 'addingChild', value: true }, { set: 'error', value: '' }] },
    { event: 'ui:click', ref: 'cancelChild', do: [{ set: 'addingChild', value: false }, { set: 'childName', value: '' }, { set: 'childBornOn', value: '' }] },
    {
      event: 'ui:click',
      ref: 'saveChild',
      do: [
        {
          call: 'createChild',
          onSuccess: [
            {
              call: 'attachChild',
              onSuccess: [
                { set: 'addingChild', value: false },
                { set: 'childName', value: '' },
                { set: 'childBornOn', value: '' },
                { call: 'family' },
              ],
            },
          ],
        },
      ],
    },

    // The keys the `attachable` declaration offers; an attached action cannot
    // reach past them.
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

export const peopleFormAction: ActionDefinition = {
  id: 'people.form',
  title: 'Edit person',
  data: {
    personId: '',
    member: {},
    trialEndsOn: '',
    notes: '',
    marketingOk: false,
    saving: false,
    error: '',
  },
  layout: peopleFormLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: personByIdPrism, target: 'member' },
    save: { url: '/api/member/vex', method: 'POST', request: personUpdatePrism, errorTarget: 'error' },
    // Consent saves on the flip, not on Save: somebody who says yes at the
    // counter does not depend on the desk pressing a button afterwards.
    consent: {
      url: '/api/member/vex',
      method: 'POST',
      request: { fingerprint: 'people/consent', context: { personId: { $ref: '$.personId' }, marketingOk: { $ref: '$.marketingOk' } } },
      errorTarget: 'error',
    },
  },
  lifecycle: {
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'trialEndsOn', value: '$.member.trial_ends_on' },
          { set: 'notes', value: '$.member.notes' },
          { set: 'marketingOk', value: '$.member.marketing_ok' },
        ],
      },
    ],
  },
  triggers: [
    { event: 'ui:model', ref: 'marketingOk', do: [{ set: 'marketingOk', value: '@event.payload' }, { call: 'consent' }] },
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

const signupBlocked = {
  $prism: {
    $or: [
      { $eq: [{ $trim: { $ref: '$.newName' } }, ''] },
      { $not: { $contains: { value: { $ref: '$.newEmail' }, search: '@' } } },
    ],
  },
};

export const peopleSignupAction: ActionDefinition = {
  id: 'people.signup',
  title: 'New person',
  data: {
    newName: '',
    signedUpEmail: '',
    signedUpRows: [],
    standingLine: '',
    onAPlan: false,
    planOptions: [],
    signupOfferingId: '',
    signupPaidVia: 'manual',
    starting: false,
    newEmail: '',
    newPhone: '',
    newTrialEndsOn: '',
    saving: false,
    blocked: true,
    error: '',
    done: false,
    signedUpName: '',
  },
  layout: peopleSignupLayout,
  endpoints: {
    create: { url: '/api/member/vex', method: 'POST', request: enrollPrism, errorTarget: 'error' },
    findSignedUp: { url: '/api/member/vex', method: 'POST', request: findSignedUpPrism, target: 'signedUpRows', errorTarget: 'error' },
    plans: { url: '/api/member/vex', method: 'POST', request: planOptionsPrism, target: 'planOptions' },
    startPlan: { url: '/api/member/vex', method: 'POST', request: startAtSignupPrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'plans' }] },
  triggers: [
    // Two triggers, not two steps: the sets of one trigger resolve against the
    // same pre-write snapshot, so `blocked` would read the field as it was a
    // keystroke ago.
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
          onSuccess: [
            { set: 'saving', value: false },
            { set: 'signedUpName', value: '$.newName' },
            { set: 'signedUpEmail', value: '$.newEmail' },
            { set: 'standingLine', value: 'is on the roll and can be booked from today.' },
            { set: 'onAPlan', value: false },
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
    {
      event: 'ui:model',
      ref: 'signupOffering',
      do: [{ set: 'signupOfferingId', value: '@event.payload' }, { call: 'findSignedUp' }],
    },
    {
      event: 'ui:click',
      ref: 'startAtSignup',
      do: [
        { set: 'error', value: '' },
        { set: 'starting', value: true },
        {
          call: 'startPlan',
          onSuccess: [
            { set: 'starting', value: false },
            { set: 'onAPlan', value: true },
            { set: 'standingLine', value: 'is a member from today.' },
            { emit: { channel: 'members-changed' } },
          ],
          onError: [{ set: 'starting', value: false }],
        },
      ],
    },
    { event: 'ui:click', ref: 'again', do: [{ set: 'done', value: false }, { set: 'onAPlan', value: false }, { set: 'signupOfferingId', value: '' }, { set: 'error', value: '' }] },
  ],
};

export const peopleSignupInputSchema = z.toJSONSchema(z.object({}));
