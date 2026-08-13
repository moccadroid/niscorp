import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { staffLayout } from './staff.layout';
import { staffDeactivatePrism, staffListPrism, staffReactivatePrism, staffSetRolePrism } from './staff.prism';

// The four the charter defines, in the operator's words. A fifth here would
// resolve to nothing — the charter is the ceiling, not this list.
const ROLE_LABELS: Record<string, string> = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor', desk: 'Front desk' };

export const staffListAction: ActionDefinition = {
  id: 'staff.list',
  title: 'Staff',
  data: {
    staff: [],
    loading: true,
    pendingStaffId: '',
    pendingRole: '',
    // Whose shell to rebuild. The staff id names the ROW; the person id names
    // the PRINCIPAL, and it is the principal that holds a shell.
    pendingPersonId: '',
    // What the confirmation is about, held as data so the sentence is written
    // once in the layout rather than assembled in three places.
    roleOptions: [
      { value: 'owner', label: 'Owner' },
      { value: 'manager', label: 'Manager' },
      { value: 'instructor', label: 'Instructor' },
      { value: 'desk', label: 'Front desk' },
    ],
    error: '',
    notice: '',
    search: '',
    // Empty means "the order the entry was written with". The engine reads
    // these two straight into the ORDER BY — no second fingerprint per column.
    sortBy: '',
    sortDir: 'asc',
  },
  layout: staffLayout,
  endpoints: {
    load: { url: '/api/staff/vex', method: 'POST', request: staffListPrism, target: 'staff' },
    setRole: { url: '/api/staff/vex', method: 'POST', request: staffSetRolePrism, errorTarget: 'error' },
    // A role change alters what the server derives AND what one person's
    // living shell was seeded with — `world.refresh` re-derives, and resets
    // the shell named by `pendingPersonId`. Hiring itself is `staff/enroll`
    // in the form; it stopped being a function the day the write grammar
    // learned ON CONFLICT and $lookup.
    refresh: { fn: 'world.refresh' },
    deactivate: { url: '/api/staff/vex', method: 'POST', request: staffDeactivatePrism, errorTarget: 'error' },
    reactivate: { url: '/api/staff/vex', method: 'POST', request: staffReactivatePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // Typing IS the interaction — no search button, same as the roll.
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },

    // A header click is a re-read, not a client-side shuffle: the database
    // owns the order, so the page you are looking at is the sorted one rather
    // than the first fifty rows rearranged.
    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.key' }, { set: 'sortDir', value: '@event.payload.dir' }, { call: 'load' }] },

    // OPEN THE FORM, do not become it. See plans.form.ts.
    { event: 'ui:click', ref: 'add', do: [{ set: 'error', value: '' }, { set: 'notice', value: '' }, { push: { action: 'staff.form', canvas: 'sheet', with: ['sheet'] } }] },
    // The form announces the hire; the REFRESH is the roster's job, because it
    // is the roster that knows a living session has to be rebuilt.
    {
      message: 'staff-changed',
      do: [{ call: 'refresh' }, { call: 'load' }, { set: 'notice', value: 'Added. They can sign in with that address now.' }],
    },

    // One trigger for the whole roster: the picker carries its row back with the
    // choice, so nothing has to work out which person a button belonged to.
    {
      event: 'ui:click',
      ref: 'role',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'pendingStaffId', value: '@event.payload.staff_id' },
        { set: 'pendingPersonId', value: '@event.payload.person_id' },
        { set: 'pendingRole', value: '@event.payload.role' },
        // Stash what it is about, then ASK — the relay pattern. This action
        // owns the write; the confirmation owns the question.
        {
          push: {
            action: 'confirm',
            canvas: 'sheet',
            with: ['sheet'],
            input: {
              title: 'Change their role?',
              message: 'A role decides what somebody sees and what the engine will answer them. It takes effect immediately, on the screen they are already looking at.',
              confirmLabel: 'Change it',
              channel: 'role-confirmed',
            },
          },
        },
      ],
    },

    {
      message: 'role-confirmed',
      do: [
        {
          call: 'setRole',
          onSuccess: [
            { call: 'refresh' },
            { call: 'load' },
            { set: 'notice', value: 'Role changed. Their application has already adopted it.' },
          ],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'deactivate',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingStaffId', value: '@event.payload.staff_id' },
        { set: 'pendingPersonId', value: '@event.payload.person_id' },
        { call: 'deactivate', onSuccess: [{ call: 'refresh' }, { call: 'load' }, { emit: { channel: 'staff-changed' } }] },
      ],
    },
    {
      event: 'ui:click',
      ref: 'reactivate',
      do: [
        { set: 'error', value: '' },
        { set: 'pendingStaffId', value: '@event.payload.staff_id' },
        { set: 'pendingPersonId', value: '@event.payload.person_id' },
        { call: 'reactivate', onSuccess: [{ call: 'refresh' }, { call: 'load' }, { emit: { channel: 'staff-changed' } }] },
      ],
    },
    { message: 'staff-changed', do: [{ call: 'load' }] },
  ],
};

export const staffListInputSchema = z.toJSONSchema(z.object({}));
