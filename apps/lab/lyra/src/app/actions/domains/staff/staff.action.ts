import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { staffLayout } from './staff.layout';
import { staffDeactivatePrism, staffListPrism, staffReactivatePrism, staffSetRolePrism } from './staff.prism';

// The four the charter defines, in the operator's words. A fifth here would
// resolve to nothing — the charter is the ceiling, not this list.
const ROLE_LABELS: Record<string, string> = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor', desk: 'Front desk' };

// WHO WORKS HERE, AND WHAT THEY MAY DO.
//
// The most consequential screen in the application, and the shortest. Changing
// a role here writes one word to one column; moss re-resolves the charter for
// that principal and their living shell adopts — a different nav, different
// surfaces, different data verbs, without anybody signing out.
//
// What it CANNOT do is worth as much as what it can. The options are the roles
// the charter defines; a role that is not in the charter resolves to nothing,
// and a role that is resolves to exactly what the charter already said. This
// screen cannot invent a permission, escalate one, or grant something nobody
// wrote down.
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
    // The four the charter defines. A fifth here would resolve to nothing —
    // the charter is the ceiling, not this list.
    roleOptions: [
      { value: 'owner', label: 'Owner' },
      { value: 'manager', label: 'Manager' },
      { value: 'instructor', label: 'Instructor' },
      { value: 'desk', label: 'Front desk' },
    ],
    error: '',
    notice: '',
    search: '',
    // Hiring.
  },
  layout: staffLayout,
  endpoints: {
    load: { url: '/api/staff/vex', method: 'POST', request: staffListPrism, target: 'staff' },
    setRole: { url: '/api/staff/vex', method: 'POST', request: staffSetRolePrism, errorTarget: 'error' },
    // The other half of the write: re-read the directory, rebuild the
    // assignment map, and have moss re-resolve the charter for every living
    // shell. Without it the row changes and nobody's application does.
    refresh: { fn: 'staff.refresh' },
    // Hiring needs a person as well as a staff row, and nothing can link the
    // two without an id — the same limit that made signing a member up a fn.
    create: { fn: 'staff.create', errorTarget: 'error' },
    deactivate: { url: '/api/staff/vex', method: 'POST', request: staffDeactivatePrism, errorTarget: 'error' },
    reactivate: { url: '/api/staff/vex', method: 'POST', request: staffReactivatePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    // Typing IS the interaction — no search button, same as the roll.
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },

    // OPEN THE FORM, do not become it. See plans.form.ts.
    { event: 'ui:click', ref: 'add', do: [{ set: 'error', value: '' }, { set: 'notice', value: '' }, { push: { action: 'staff.form', canvas: 'sheet', with: ['sheet'] } }] },
    // The form announces the hire; the REFRESH is the roster's job, because it
    // is the roster that knows a living session has to be rebuilt.
    {
      message: 'staff-changed',
      do: [{ call: 'refresh' }, { call: 'load' }, { set: 'notice', value: 'Added. They can sign in with that address now.' }],
    },

    // One ref per role, because a role change is a different decision per role
    // and the trigger grammar has no conditional. Four small triggers beat one
    // that has to work out what was meant.
    // ONE trigger for the whole roster, because the picker carries its row
    // back with the choice. Four refs used to be needed only because four
    // buttons could not say which person they belonged to.
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


    // The write, once somebody has said yes. A MESSAGE, not a click — the
    // confirmation is a different action on a different canvas and the two
    // never reference each other.
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
