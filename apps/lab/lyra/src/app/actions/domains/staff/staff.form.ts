import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';

// PUTTING SOMEBODY ON STAFF, over the roster rather than inside it. See
// `plans.form.ts` for the argument.
//
// Create only. Changing a role afterwards is a different gesture with a
// different safeguard — a picker on the row and the shared `confirm` — because
// hiring and re-permissioning are not the same decision.
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
    { component: 'Button', props: { variant: 'solid', big: true, label: 'Add to staff', disabled: '$.saving' }, ref: 'create' },
  ],
};

export const staffFormAction: ActionDefinition = {
  id: 'staff.form',
  title: 'Put somebody on staff',
  data: { newName: '', newEmail: '', newPhone: '', newRole: 'instructor', saving: false, error: '' },
  layout: staffFormLayout,
  endpoints: {
    // A FUNCTION, not a fingerprint: hiring writes a person and a staff row
    // and has to be one act, which the closed mutation grammar deliberately
    // cannot express.
    create: { fn: 'staff.create', errorTarget: 'error' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'create',
      do: [
        { set: 'error', value: '' },
        { set: 'saving', value: true },
        {
          call: 'create',
          // The roster listens for this and does the refresh — including
          // rebuilding the application of a member who just started teaching,
          // so they are not told to sign out and in.
          onSuccess: [{ set: 'saving', value: false }, { emit: { channel: 'staff-changed' } }, { pop: true }],
          onError: [{ set: 'saving', value: false }],
        },
      ],
    },
  ],
};

export const staffFormInputSchema = z.toJSONSchema(z.object({}));
