import type { LayoutNode } from '@niscorp/nova';

// The roll's three faces. Same kit, same `Rows` spec vocabulary — the list of
// members and the timetable are the same component with different columns,
// which is the whole reason there is no MemberRow.

const page = (children: LayoutNode | LayoutNode[]): LayoutNode => ({
  component: 'Stack',
  props: { gap: 22 },
  children,
});

export const peopleListLayout: LayoutNode = page([
  {
    component: 'Row',
    props: { justify: 'between', align: 'center' },
    children: [
      { component: 'Hero', props: { title: 'Members' } },
      { component: 'Button', props: { variant: 'solid', label: 'Add a member' }, ref: 'add' },
      // A FILTER, WEARING A FILTER'S CONTROL.
      //
      // This was two buttons, and the comment beside them said `Tabs` "cannot
      // work here: it emits one ref carrying the chosen value, and the trigger
      // grammar has no way to branch on it." True, and the wrong conclusion —
      // the grammar's answer to branching has always been to put the difference
      // in the PAYLOAD, which is how one ref already serves a list of a hundred
      // rows. So each slice carries its own `statuses` and one trigger reads
      // them off the option.
      //
      // Which matters beyond tidiness: two buttons look like two ACTIONS, and
      // "Everyone" is not something you do to the roll. A segmented control
      // says the screen has two states and you are in one of them.
      { component: 'Tabs', props: { value: '$.scope', options: '$.scopes' }, ref: 'scope' },
    ],
  },

  // THE SEARCH BOX, and the line under it that stops the list lying.
  //
  // A roll capped at fifty looks complete at any studio with more than fifty
  // members. Saying how many matched is the difference between a filter and a
  // silent truncation, and it is the only honest way to cap a list at all.
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      { component: 'Input', props: { placeholder: 'Search by name or email' }, ref: 'search', model: '$.search' },
      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.totalDisplay' },
    ],
  },

  {
    component: 'Card',
    props: { flush: true },
    children: {
      component: 'Rows',
      props: {
        rows: '$.rows',
        loading: '$.loading',
        rowKey: 'membership_id',
        onRowRef: 'open',
        empty: 'Nobody here yet.',
        emptyHint: 'Members appear once somebody signs up or the desk adds them.',
        columns: [
          { label: 'Member', w: 2, cell: { kind: 'avatar', key: 'person_name', subKey: 'email' } },
          { label: 'Status', px: 92, cell: { kind: 'badge', key: 'status_display', toneKey: 'status_tone' } },
          { label: 'Joined', px: 104, align: 'right', cell: { kind: 'text', key: 'joined_display', color: 'mute' } },
        ],
      },
    },
  },
]);

export const peopleDetailLayout: LayoutNode = page([
  // NO BACK BUTTON, and the reason is the rule this file used to break.
  //
  // Back is NAVIGATION, and navigation is the shell's. An action that draws its
  // own way out is an action that knows it was pushed — which is exactly what
  // it must not know, because the same action is also mounted bare by a kiosk
  // and would then offer a door to nowhere. The sheet fragment supplies the
  // dismissal; a stack supplies its own.

  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 14 },
    children: [
      {
        component: 'Row',
        props: { gap: 14, align: 'center' },
        children: [
          { component: 'Avatar', props: { name: '$.member.person_name', size: 52 } },
          {
            component: 'Stack',
            props: { gap: 3 },
            children: [
              { component: 'Text', props: { size: 'xl', weight: 'semi' }, children: '$.member.person_name' },
              { component: 'Badge', props: { tone: '$.member.status_tone', label: '$.member.status_display' } },
            ],
          },
        ],
      },
      { component: 'Button', props: { variant: 'solid', label: 'Edit' }, ref: 'edit' },
    ],
  },

  { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

  // FIELDS, NOT STATS, AND ONE CARD RATHER THAN THREE. `Stat` renders a
  // FIGURE — 22px, tabular numerals, tightened tracking — and it was rendering
  // `omar.haddad@example.com` at display size in its own bordered box, three
  // boxes wide, for what is one block of contact details. A stat is for 412
  // classes and €595 a month.
  {
    component: 'Card',
    props: { pad: 18 },
    children: {
      component: 'Grid',
      props: { min: 180, gap: 18 },
      children: [
        { component: 'Field', props: { label: 'Email', icon: 'mail', value: '$.member.email', empty: 'Not given' } },
        { component: 'Field', props: { label: 'Phone', icon: 'phone', value: '$.member.phone', empty: 'Not given' } },
        { component: 'Field', props: { label: 'Joined', icon: 'clock', value: '$.member.joined_display' } },
      ],
    },
  },
  {
    component: 'Section',
    props: { title: 'Notes', subtitle: 'What the desk has written down. Members never see this.' },
    children: {
      component: 'Card',
      props: {},
      // A note is PROSE — somebody's sentences about a person, at whatever
      // length they needed. `Text` is a span with no leading and no measure.
      children: { if: '$.member.notes', then: { component: 'Prose', props: { color: 'soft' }, children: '$.member.notes' }, else: { component: 'Text', props: { color: 'faint' }, children: 'Nothing noted.' } },
    },
  },

  // THE RIDERS' STRIP — panels installed packs attach to this record, derived
  // per studio (granted ∩ installed ∩ attached-here), labelled from their own
  // actions. This screen never learns a pack's name, and when nothing rides,
  // nothing renders — the guard is a count because an empty array is truthy.
  {
    if: '$.attachmentCount',
    then: {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.attachments',
          rowKey: 'action',
          onRowRef: 'openAttachment',
          headers: false,
          columns: [
            { label: '', w: 1, cell: { kind: 'primary', key: 'label', subKey: 'hint' } },
            { label: '', px: 112, align: 'right', cell: { kind: 'bands', key: 'bands' } },
          ],
        },
      },
    },
    else: '',
  },

  // COURSES, from the desk's side.
  //
  // The desk has held the grant to enrol somebody since courses landed and had
  // nowhere to do it — capability with no door, which is the same shape of bug
  // as a read-only screen called "Timetable". The member's record is the right
  // door: it is where somebody stands when a person at the counter says "put
  // me on the beginners block".
  {
    component: 'Section',
    props: { title: 'Courses', subtitle: 'Blocks this member is on. Joining holds their place for every week of it.' },
    children: {
      component: 'Stack',
      props: { gap: 14 },
      children: [
        {
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.enrolments',
              rowKey: 'enrolment_id',
              empty: 'Not on any course.',
              columns: [
                { label: 'Course', w: 2, cell: { kind: 'primary', key: 'course_name', subKey: 'dates_display' } },
                { label: 'Joined', px: 120, cell: { kind: 'text', key: 'enrolled_display' } },
                { label: '', px: 104, align: 'right', cell: { kind: 'action', label: 'Take off', ref: 'withdraw', variant: 'ghost' } },
              ],
            },
          },
        },
        {
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.courses',
              rowKey: 'course_id',
              empty: 'No courses running.',
              columns: [
                { label: 'Put them on', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'dates_display', dotKey: 'tone' } },
                { label: 'Places', px: 88, align: 'right', cell: { kind: 'text', key: 'places_display' } },
                // Hidden when the block is full — the database would refuse it,
                // and offering it anyway is a promise the screen cannot keep.
                { label: '', px: 84, align: 'right', cell: { kind: 'action', label: 'Enrol', ref: 'enrol', variant: 'outline', hideKey: 'full' } },
              ],
            },
          },
        },
      ],
    },
  },

  // Ending and restarting are the same control in two states, because they are
  // the same decision. A cancelled membership offers the way back rather than
  // a dead row.
  {
    component: 'Section',
    props: { title: 'Membership' },
    children: {
      if: { $eq: ['$.member.status', 'cancelled'] },
      then: {
        component: 'Row',
        props: { gap: 12, align: 'center' },
        children: [
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'This membership has ended.' },
          { component: 'Button', props: { variant: 'outline', label: 'Reactivate' }, ref: 'reactivate' },
        ],
      },
      else: {
        component: 'Row',
        props: { gap: 12, align: 'center' },
        children: [
          { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Ending a membership keeps the record — it is how a studio can see who left.' },
          { component: 'Button', props: { variant: 'danger', label: 'End membership' }, ref: 'end' },
        ],
      },
    },
  },
]);

export const peopleFormLayout: LayoutNode = page([
  { component: 'Hero', props: { eyebrow: '$.member.person_name', title: 'Edit member' } },

  {
    component: 'Card',
    props: { pad: 22 },
    children: {
      component: 'Stack',
      props: { gap: 18, maxWidth: 460 },
      children: [
        {
          component: 'Select',
          props: {
            label: 'Status',
            hint: 'Where this membership is in its life. Trials become active; paused keeps the place without billing.',
            options: [
              { value: 'trialling', label: 'Trial' },
              { value: 'active', label: 'Active' },
              { value: 'paused', label: 'Paused' },
              { value: 'lapsed', label: 'Lapsed' },
              { value: 'cancelled', label: 'Cancelled' },
            ],
          },
          ref: 'status',
          model: '$.status',
        },
        {
          component: 'Textarea',
          props: { label: 'Notes', rows: 5, placeholder: 'Anything the desk should know.', hint: 'Internal only — the member never sees this.' },
          ref: 'notes',
          model: '$.notes',
        },
        { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
        {
          component: 'Row',
          props: { gap: 10 },
          children: [
            { component: 'Button', props: { variant: 'solid', label: 'Save', disabled: '$.saving' }, ref: 'save' },
          ],
        },
      ],
    },
  },
]);

// SIGNING SOMEBODY UP — its own screen, not a panel on the roll.
//
// It is its own action because it is the only thing a KIOSK does. A tablet by
// the door mounts this and nothing else: no roll behind it, no nav, no way
// through to anybody's record. Folding it into the list as a mode would have
// meant shipping the whole roll to reach the form, which for a kiosk is not a
// layout preference — it is the difference between a sign-up sheet and a
// customer list left open on the counter.
//
// It draws NO way out, and that is the point. Pushed into the sheet, the
// fragment supplies the dismissal; mounted bare by a kiosk there is nothing to
// dismiss to, and the same layout is correct in both cases because it never
// asked how it got there.
export const peopleSignupLayout: LayoutNode = page([
  {
    // Done and not-done are the same screen with the middle swapped, so the
    // heading never jumps and a kiosk never looks like it navigated.
    if: '$.done',
    then: {
      component: 'Stack',
      props: { gap: 22 },
      children: [
        // The name is the whole message, so it is the heading. `set` resolves
        // bindings but does not evaluate Prism ops, so there is no way to
        // build "Nora is on the roll" as one string in a trigger — and no
        // reason to, when the layout can put the two next to each other.
        { component: 'Hero', props: { title: '$.signedUpName', lead: 'is on the roll and can book from today.' } },
        {
          component: 'Card',
          props: { pad: 22 },
          children: {
            component: 'Stack',
            props: { gap: 16, maxWidth: 480 },
            children: [
              {
                component: 'Row',
                props: { gap: 10, wrap: true },
                children: [
                  { component: 'Button', props: { variant: 'solid', big: true, label: 'Sign somebody else up' }, ref: 'again' },
                ],
              },
            ],
          },
        },
      ],
    },
    else: {
      component: 'Stack',
      props: { gap: 22 },
      children: [
        { component: 'Hero', props: { title: 'New member', lead: 'Name and email are all we need. Everything else can wait.' } },
        {
          component: 'Card',
          props: { pad: 22 },
          children: {
            component: 'Stack',
            props: { gap: 16, maxWidth: 480 },
            children: [
              { component: 'Input', props: { label: 'Name', big: true, placeholder: 'Ava Klein' }, ref: 'newName', model: '$.newName' },
              { component: 'Input', props: { label: 'Email', type: 'email', big: true, placeholder: 'ava@example.com', hint: 'How they sign in. If we already know this address we reuse the person.' }, ref: 'newEmail', model: '$.newEmail' },
              { component: 'Input', props: { label: 'Phone', type: 'tel' }, ref: 'newPhone', model: '$.newPhone' },
              {
                component: 'Select',
                props: {
                  label: 'Starting as',
                  options: [
                    { value: 'trialling', label: 'Trial' },
                    { value: 'active', label: 'Active' },
                  ],
                },
                ref: 'newStatus',
                model: '$.newStatus',
              },
              { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
              {
                component: 'Row',
                props: { gap: 10 },
                children: [
                  { component: 'Button', props: { variant: 'solid', big: true, label: 'Sign them up', disabled: '$.saving' }, ref: 'create' },
                ],
              },
            ],
          },
        },
      ],
    },
  },
]);
