import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { peopleListLayout, peopleDetailLayout, peopleFormLayout, peopleSignupLayout } from './people.layouts';
import { membersCountPrism, enrolPrism, memberByIdPrism, memberEndPrism, memberEnrolmentsPrism, memberReactivatePrism, memberUpdatePrism, membersListPrism, openCoursesPrism, withdrawPrism } from './people.prism';

// The roll: list → detail → form. Three actions, one entity, and the shape the
// order of work asks for.
//
// They are separate actions rather than one with a mode, because they are
// separate things a person can be looking at: a list has a filter and a
// scroll position, a record has a subject, a form has unsaved edits. Folding
// them together is what makes a Back button ambiguous.

// ── the list ─────────────────────────────────────────────────
export const peopleListAction: ActionDefinition = {
  id: 'people.list',
  title: 'Members',
  data: {
    rows: [],
    loading: true,
    // Which slice is on screen, and the parameter the read takes. One value
    // doing both jobs is why there is no branch anywhere below.
    scope: 'current',
    statuses: ['active', 'trialling'],
    // THE SLICES, EACH CARRYING WHAT IT MEANS. `Tabs` dispatches the whole
    // option, so the statuses ride back with the choice and one trigger serves
    // both — no `currentVariant`/`everyoneVariant` pair to keep in step, and
    // no second trigger that has to remember to do everything the first does.
    scopes: [
      { value: 'current', label: 'Current', statuses: ['active', 'trialling'] },
      { value: 'everyone', label: 'Everyone', statuses: ['active', 'trialling', 'paused', 'lapsed', 'cancelled'] },
    ],

    // WHAT WAS TYPED. Just that —
    // The wildcards are added in the request prism (see `people.prism`), which
    // keeps `%` out of the box and out of this file. Empty search sends `%%`,
    // which matches everything — so there is no "searching" mode and no second
    // read: the list is always the same query.
    countRow: {},
    search: '',
    totalDisplay: '',
  },
  layout: peopleListLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: membersListPrism, target: 'rows' },
    count: { url: '/api/member/vex', method: 'POST', request: membersCountPrism, target: 'countRow' },
  },
  lifecycle: {
    mount: [
      { call: 'load', onSuccess: [{ set: 'loading', value: false }] },
      { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] },
    ],
  },
  // Two slices, ONE ref — and no branch anywhere.
  //
  // There is no conditional step in the trigger grammar, which reads at first
  // like a limitation and is closer to a hint: the tab sets the parameter from
  // its own option and re-runs the SAME read, so "which slice am I on" is a
  // value rather than a fork. The payoff is the last trigger — a save re-reads
  // correctly whichever slice is showing, with nothing to remember.
  triggers: [
    { event: 'ui:click', ref: 'scope', do: [{ set: 'scope', value: '@event.payload.value' }, { set: 'statuses', value: '@event.payload.statuses' }, { set: 'loading', value: true }, { call: 'load', onSuccess: [{ set: 'loading', value: false }] }, { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] }] },

    // A row opens the record on top, so Back returns to the list — with the
    // slice it was showing, because the list instance was never unmounted.
    { event: 'ui:click', ref: 'open', do: [{ push: { action: 'people.detail', canvas: 'sheet', with: ['sheet'], input: { membershipId: '@event.payload.membership_id' } } }] },

    // Signing somebody up is its own screen, pushed like a record — so the
    // roll keeps its slice and its scroll, and a kiosk can mount the same
    // action with nothing underneath it.
    { event: 'ui:click', ref: 'add', do: [{ push: { action: 'people.signup', canvas: 'sheet', with: ['sheet'] } }] },

    // TYPING IS THE WHOLE INTERACTION. No search button, because a button is a
    // second thing to find; the model write lands first (`set` before anything
    // reads it) and the pattern is built from it in the same step.
    {
      event: 'ui:model',
      ref: 'search',
      do: [
        // The write lands FIRST — the read below reads `$.search`, and a
        // `call` before the `set` sends the previous keystroke's value.
        { set: 'search', value: '@event.payload' },
        { call: 'load' },
        { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] },
      ],
    },

    // Writers announce, viewers react.
    { message: 'members-changed', do: [{ call: 'load' }, { call: 'count', onSuccess: [{ set: 'totalDisplay', value: '$.countRow.total_display' }] }] },
  ],
};

export const peopleListInputSchema = z.toJSONSchema(
  z.object({
    scope: z.enum(['current', 'everyone']).optional().describe("Which slice to open on: 'current' is the working roll, 'everyone' includes lapsed and cancelled."),
  }),
);

// ── the record ───────────────────────────────────────────────
export const peopleDetailAction: ActionDefinition = {
  id: 'people.detail',
  title: 'Member',
  data: {
    membershipId: '',
    member: {},
    courses: [],
    enrolments: [],
    courseId: '',
    enrolmentId: '',
    loading: true,
    error: '',
    // THE SEAT. This screen declared itself attachable (app.ts `attachable`),
    // so installed packs may ride it. `hostId` is the self-naming the fn keys
    // on — the same pattern a hub uses — and the count exists because an empty
    // array is truthy and a strip with nothing in it must not render a box.
    hostId: 'people.detail',
    attachments: [],
    attachmentCount: 0,
  },
  layout: peopleDetailLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: memberByIdPrism, target: 'member' },
    end: { url: '/api/member/vex', method: 'POST', request: memberEndPrism, errorTarget: 'error' },
    reactivate: { url: '/api/member/vex', method: 'POST', request: memberReactivatePrism, errorTarget: 'error' },
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
    ],
    // Coming back from the form: re-read rather than trust what was left
    // behind. The form may have written something this record has not seen.
    resume: [{ call: 'load' }, { call: 'enrolments' }, { call: 'courses' }],
  },
  triggers: [
    { event: 'ui:click', ref: 'edit', do: [{ push: { action: 'people.form', canvas: 'sheet', with: ['sheet'], input: { membershipId: '$.membershipId' } } }] },

    // A RIDER OPENS ON THE SHEET, handed exactly what this screen offered:
    // the membership on screen and the person's name. This trigger is the
    // implementation of the `attachable` declaration — the offered keys are
    // bound HERE, once, by the host; a rider cannot reach past them.
    {
      event: 'ui:click',
      ref: 'openAttachment',
      do: [
        {
          push: {
            action: '@event.payload.action',
            canvas: 'sheet',
            with: ['sheet'],
            input: { membership_id: '$.membershipId', person_name: '$.member.person_name' },
          },
        },
      ],
    },

    // Enrolling from the counter. The write names the course and the record on
    // screen; nothing in it names a human.
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
      ref: 'end',
      do: [{ call: 'end', onSuccess: [{ call: 'load' }, { emit: { channel: 'members-changed' } }] }],
    },
    {
      event: 'ui:click',
      ref: 'reactivate',
      do: [{ call: 'reactivate', onSuccess: [{ call: 'load' }, { emit: { channel: 'members-changed' } }] }],
    },
    { message: 'members-changed', do: [{ call: 'load' }] },
  ],
};

export const peopleDetailInputSchema = z.toJSONSchema(
  z.object({
    membershipId: z.string().describe('Which membership to show. Scoped engine-side — an id from another studio resolves to nothing.'),
  }),
);

// ── the form ─────────────────────────────────────────────────
//
// One form per entity (working patterns). This one EDITS: it takes a
// membership id and changes the two fields a desk changes. Creating is a
// different screen — `people.signup` — because it needs a person as well as a
// membership, and because a kiosk mounts the create and must never be one pop
// away from somebody's record.
export const peopleFormAction: ActionDefinition = {
  id: 'people.form',
  title: 'Edit member',
  data: {
    membershipId: '',
    member: {},
    // The editable fields, held apart from `member` so a cancel is a pop and
    // not an undo.
    status: '',
    notes: '',
    saving: false,
    error: '',
  },
  layout: peopleFormLayout,
  endpoints: {
    load: { url: '/api/member/vex', method: 'POST', request: memberByIdPrism, target: 'member' },
    save: { url: '/api/member/vex', method: 'POST', request: memberUpdatePrism, errorTarget: 'error' },
  },
  lifecycle: {
    // Seed the fields from the record. The raw `status` travels alongside its
    // display string precisely so a form can round-trip without re-parsing a
    // label somebody translated.
    mount: [
      {
        call: 'load',
        onSuccess: [
          { set: 'status', value: '$.member.status' },
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
    membershipId: z.string().describe('The membership being edited. Loaded bare, this form has nothing to edit.'),
  }),
);

// ── signing somebody up ──────────────────────────────────────
//
// Its own action because it is the only thing a kiosk does. A tablet at the
// door mounts `people.signup` and nothing else — no roll behind it, no nav,
// nothing to navigate to. That is a canvas decision rather than a permission
// one, which is exactly why the form had to stop being a mode on the list.
//
// The write is the application's one `fn:` — see server/functions/members.ts.
// It mints an id and replays two authored mutations over the session's own
// wire, so the engine still stamps the studio.
export const peopleSignupAction: ActionDefinition = {
  id: 'people.signup',
  title: 'New member',
  data: {
    newName: '',
    newEmail: '',
    newPhone: '',
    newStatus: 'trialling',
    saving: false,
    error: '',
    // The confirmation. A kiosk stays on it and signs the next person up;
    // a desk reads it and goes back.
    done: false,
    signedUpName: '',
  },
  layout: peopleSignupLayout,
  endpoints: { create: { fn: 'members.create', errorTarget: 'error' } },
  triggers: [
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        {
          call: 'create',
          // The name is captured BEFORE the fields are cleared — the steps run
          // in order, and reading it afterwards would confirm an empty string.
          onSuccess: [
            { set: 'saving', value: false },
            { set: 'signedUpName', value: '$.newName' },
            { set: 'done', value: true },
            { set: 'newName', value: '' },
            { set: 'newEmail', value: '' },
            { set: 'newPhone', value: '' },
            { set: 'newStatus', value: 'trialling' },
            { emit: { channel: 'members-changed' } },
          ],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
    { event: 'ui:click', ref: 'again', do: [{ set: 'done', value: false }, { set: 'error', value: '' }] },
  ],
};

// NO INPUT. `returnable` used to live here — a flag telling the action whether
// something had pushed it, so it could decide whether to draw a Back button.
// That is an action reading its own context, and the sheet fragment made it
// unnecessary: pushed, the fragment supplies the way out; mounted bare by a
// kiosk, there is no way out and that is correct.
export const peopleSignupInputSchema = z.toJSONSchema(z.object({}));
