import { z } from 'zod';
import type { ActionDefinition } from '@niscorp/nova';
import { staffLayout } from './staff.layout';
import { staffDeactivatePrism, staffListPrism, staffReactivatePrism, staffSetRolePrism } from './staff.prism';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', manager: 'Manager', instructor: 'Instructor', desk: 'Front desk' };

export const staffListAction: ActionDefinition = {
  id: 'staff.list',
  title: 'Staff',
  data: {
    staff: [],
    loading: true,
    pendingStaffId: '',
    pendingRole: '',
    // Read by `world.refresh`, which resets this person's shell: the staff id
    // names the row, the person id the principal that holds a shell.
    pendingPersonId: '',
    roleOptions: [
      { value: 'owner', label: 'Owner' },
      { value: 'manager', label: 'Manager' },
      { value: 'instructor', label: 'Instructor' },
      { value: 'desk', label: 'Front desk' },
    ],
    error: '',
    notice: '',
    search: '',
    sortBy: '',
    sortDir: 'asc',
  },
  layout: staffLayout,
  endpoints: {
    load: { url: '/api/staff/vex', method: 'POST', request: staffListPrism, target: 'staff' },
    setRole: { url: '/api/staff/vex', method: 'POST', request: staffSetRolePrism, errorTarget: 'error' },
    refresh: { fn: 'world.refresh' },
    deactivate: { url: '/api/staff/vex', method: 'POST', request: staffDeactivatePrism, errorTarget: 'error' },
    reactivate: { url: '/api/staff/vex', method: 'POST', request: staffReactivatePrism, errorTarget: 'error' },
  },
  lifecycle: { mount: [{ call: 'load', onSuccess: [{ set: 'loading', value: false }] }] },
  triggers: [
    { event: 'ui:model', ref: 'search', do: [{ set: 'search', value: '@event.payload' }, { call: 'load' }] },

    { event: 'ui:click', ref: 'sort', do: [{ set: 'sortBy', value: '@event.payload.key' }, { set: 'sortDir', value: '@event.payload.dir' }, { call: 'load' }] },

    { event: 'ui:click', ref: 'add', do: [{ set: 'error', value: '' }, { set: 'notice', value: '' }, { push: { action: 'staff.form', canvas: 'sheet', with: ['sheet'] } }] },
    {
      message: 'staff-changed',
      do: [{ call: 'refresh' }, { call: 'load' }, { set: 'notice', value: 'Added. They can sign in with that address now.' }],
    },

    {
      event: 'ui:click',
      ref: 'role',
      do: [
        { set: 'error', value: '' },
        { set: 'notice', value: '' },
        { set: 'pendingStaffId', value: '@event.payload.staff_id' },
        { set: 'pendingPersonId', value: '@event.payload.person_id' },
        { set: 'pendingRole', value: '@event.payload.role' },
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
