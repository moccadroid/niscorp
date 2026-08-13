import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { staffEnroll } from '@lyra/app/vex/staff.entries';

// The whole hire as one replay — `staff/enroll` ensures the person and puts
// them on staff in a single transaction; the role select's options are the
// contract, so no role check is needed beyond the DB's own.
const hirePrism = {
  fingerprint: staffEnroll.fingerprint,
  context: {
    email: { $lower: { $trim: { $ref: '$.newEmail' } } },
    name: { $trim: { $ref: '$.newName' } },
    phone: { $trim: { $ref: '$.newPhone' } },
    role: { $ref: '$.newRole' },
  },
};

// Refused by never enabling the button rather than by a thrown error: a blank
// name, or an address without an @.
const hireBlocked = {
  $prism: {
    $or: [
      { $eq: [{ $trim: { $ref: '$.newName' } }, ''] },
      { $not: { $contains: { value: { $ref: '$.newEmail' }, search: '@' } } },
    ],
  },
};

const staffFormLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 16 },
  children: [
    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
    { component: 'Input', props: { label: 'Name', placeholder: 'Tobias Reiner' }, ref: 'newName', model: '$.newName' },
    {
      component: 'Input',
      props: {
        label: 'Email',
        type: 'email',
        placeholder: 'tobias@lumen.studio',
        hint: 'How they sign in. A member who starts teaching keeps the address — and the same person record.',
      },
      ref: 'newEmail',
      model: '$.newEmail',
    },
    { component: 'Input', props: { label: 'Phone', type: 'tel' }, ref: 'newPhone', model: '$.newPhone' },
    {
      component: 'Select',
      props: {
        label: 'Role',
        hint: 'What they can do from the moment they sign in. Changeable on the roster, at any time.',
        options: [
          { value: 'instructor', label: 'Instructor' },
          { value: 'desk', label: 'Front desk' },
          { value: 'manager', label: 'Manager' },
          { value: 'owner', label: 'Owner' },
        ],
      },
      ref: 'newRole',
      model: '$.newRole',
    },
    { component: 'Button', props: { variant: 'solid', big: true, label: 'Add to staff', disabled: '$.blocked' }, ref: 'create' },
  ],
};

export const staffFormAction: ActionDefinition = {
  id: 'staff.form',
  title: 'Put somebody on staff',
  data: { newName: '', newEmail: '', newPhone: '', newRole: 'instructor', saving: false, blocked: true, error: '' },
  layout: staffFormLayout,
  endpoints: {
    create: { url: '/api/staff/vex', method: 'POST', request: hirePrism, errorTarget: 'error' },
  },
  triggers: [
    // Two triggers per field, not two steps — buffered sets in one trigger
    // resolve against the same pre-write snapshot (see people.signup).
    { event: 'ui:model', ref: 'newName', do: [{ set: 'newName', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newEmail', do: [{ set: 'newEmail', value: '@event.payload' }] },
    { event: 'ui:model', ref: 'newName', do: [{ set: 'blocked', value: hireBlocked }] },
    { event: 'ui:model', ref: 'newEmail', do: [{ set: 'blocked', value: hireBlocked }] },
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        { set: 'blocked', value: true },
        {
          call: 'create',
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'staff-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }, { set: 'blocked', value: hireBlocked }],
        },
      ],
    },
  ],
};

export const staffFormInputSchema = z.toJSONSchema(z.object({}));
