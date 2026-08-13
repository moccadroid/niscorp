import type { LayoutNode } from '@niscorp/nova';

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
      { component: 'Hero', props: { title: 'People' } },
      { component: 'Button', props: { variant: 'solid', label: 'Add a person' }, ref: 'add' },
      { component: 'Tabs', props: { value: '$.scope', options: '$.scopes' }, ref: 'scope' },
    ],
  },

  // The count beside the search box is what stops a capped list lying: fifty
  // rows look complete at a studio with two thousand members.
  {
    component: 'Row',
    props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
    children: [
      { component: 'Input', props: { placeholder: 'Search by name or email' }, ref: 'search', model: '$.search' },
      { component: 'Text', props: { size: 'sm', color: 'mute', phrase: '$.totalDisplay' } },
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
        rowKey: 'person_id',
        onRowRef: 'open',
        empty: 'Nobody here yet.',
        emptyHint: 'People appear once somebody asks, signs up, or the desk writes them down.',
        // The database owns the order, so a header click re-reads rather than
        // shuffling the fifty rows already on screen — sorting two thousand
        // people by the fifty you happen to be looking at is not sorting.
        // Standing is deliberately NOT sortable: it is computed per row and no
        // dialect will order by an alias that is not a column.
        sortKey: '$.sortBy',
        sortDir: '$.sortDir',
        onSortRef: 'sort',
        columns: [
          { label: 'Person', w: 2, sortable: 'people.name', cell: { kind: 'avatar', key: 'person_name', subKey: 'email' } },
          { label: 'Standing', px: 100, cell: { kind: 'badge', key: 'status_display', toneKey: 'status_tone' } },
          { label: 'First seen', px: 104, align: 'right', sortable: 'studio_people.first_seen_on', cell: { kind: 'text', key: 'joined_display', color: 'mute' } },
        ],
      },
    },
  },

  // THE WAY TO PERSON FIFTY-ONE. Shown only while a full page came back:
  // a short page is the end of the roll, and a button that fetches nothing
  // is a button that lies about there being more.
  {
    if: '$.hasMore',
    then: {
      component: 'Row',
      props: { justify: 'center' },
      children: { component: 'Button', props: { variant: 'outline', label: 'Show more' }, ref: 'more' },
    },
    else: '',
  },
]);

export const peopleDetailLayout: LayoutNode = page([

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

  {
    component: 'Card',
    props: { pad: 18 },
    children: {
      component: 'Grid',
      props: { min: 180, gap: 18 },
      children: [
        { component: 'Field', props: { label: 'Email', icon: 'mail', value: '$.member.email', empty: 'Not given' } },
        { component: 'Field', props: { label: 'Phone', icon: 'phone', value: '$.member.phone', empty: 'Not given' } },
        { component: 'Field', props: { label: 'First seen', icon: 'clock', value: '$.member.joined_display' } },
      ],
    },
  },
  {
    component: 'Section',
    props: { title: 'Notes', subtitle: 'What the desk has written down. Members never see this.' },
    children: {
      component: 'Card',
      props: {},
      // A note is PROSE, at whatever length somebody needed. `Text` is a span
      // with no leading and no measure.
      children: { if: '$.member.notes', then: { component: 'Prose', props: { color: 'soft' }, children: '$.member.notes' }, else: { component: 'Text', props: { color: 'faint' }, children: 'Nothing noted.' } },
    },
  },

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

  // ── WHAT THEY HOLD ─────────────────────────────────────────
  //
  // Drawn from data, not from capability: a rung that cannot read a
  // subscription gets an empty object here and the section is simply absent.
  // No branch asks what anybody is allowed to do.
  {
    if: '$.subscription.subscription_id',
    then: {
      component: 'Section',
      props: { title: 'Plan and terms' },
      children: {
        component: 'Stack',
        props: { gap: 12 },
        children: [
          {
            component: 'Row',
            props: { gap: 22, wrap: true },
            children: [
              { component: 'Field', props: { label: 'Plan', value: '$.subscription.plan_name' } },
              { component: 'Field', props: { label: 'Worth', value: '$.subscription.value_display' } },
              // `phrase` for the three that carry vocabulary or a counted
              // pattern; names, money and dates stay `value` — data, already
              // in the reader's locale, and the pass must never rename them.
              { component: 'Field', props: { label: 'Minimum term', phrase: '$.subscription.term_display' } },
              { component: 'Field', props: { label: 'Notice', phrase: '$.subscription.notice_display' } },
              { component: 'Field', props: { label: 'Committed until', value: '$.subscription.committed_display', empty: 'No commitment' } },
              { component: 'Field', props: { label: 'Paid', phrase: '$.subscription.paid_via_display' } },
              { component: 'Field', props: { label: 'Paid until', value: '$.subscription.paid_until_display', empty: 'Nothing recorded' } },
            ],
          },
          // The desk's own pen for money it took itself: cash, a transfer, the
          // SEPA run. Standing only — the ledger is a later feature, and the
          // screen says what was decided rather than pretending otherwise.
          {
            component: 'Row',
            props: { gap: 10, align: 'end', wrap: true },
            children: [
              { component: 'Input', props: { label: 'Their money reaches', type: 'date' }, ref: 'paidUntil', model: '$.paidUntil' },
              { component: 'Button', props: { variant: 'outline', label: 'Record payment' }, ref: 'recordPayment' },
            ],
          },
          {
            if: '$.subscription.notice_given',
            // Once notice is given the date is the fact worth showing, and the
            // control becomes the way back rather than a second way forward.
            then: {
              component: 'Row',
              props: { gap: 12, align: 'center', wrap: true },
              children: [
                { component: 'Badge', props: { label: 'Leaving', tone: 'warn' } },
                { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Last day {{$.subscription.ends_display}} — the longer of their notice period and their minimum term.' },
                { component: 'Button', props: { variant: 'ghost', label: 'They changed their mind' }, ref: 'withdrawNotice' },
              ],
            },
            else: {
              component: 'Row',
              props: { gap: 12, align: 'center', wrap: true },
              children: [
                { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Notice runs its course — a commitment outlives notice given inside it.' },
                { component: 'Button', props: { variant: 'outline', label: 'Give notice' }, ref: 'giveNotice' },
                { component: 'Button', props: { variant: 'danger', label: 'End now' }, ref: 'end' },
              ],
            },
          },
        ],
      },
    },
    // No subscription: the desk puts them on a plan, saying how it will be
    // paid. This is the write the old model did not have — a studio with no
    // payment processor sells a plan right here.
    else: {
      component: 'Section',
      props: { title: 'Plan', subtitle: 'Nothing running. Starting a plan grants access from today; how the money moves is its own question.' },
      children: {
        component: 'Row',
        props: { gap: 10, align: 'end', wrap: true },
        children: [
          { component: 'Select', props: { label: 'Plan', options: '$.planOptions', placeholder: 'Choose a plan' }, ref: 'startOffering', model: '$.startOfferingId' },
          {
            component: 'Select',
            props: {
              label: 'Paid',
              options: [
                { value: 'manual', label: 'Billed by the studio' },
                { value: 'comp', label: 'Complimentary' },
              ],
            },
            ref: 'startPaidVia',
            model: '$.startPaidVia',
          },
          { component: 'Button', props: { variant: 'solid', label: 'Start plan' }, ref: 'startPlan' },
        ],
      },
    },
  },

  // ── PASSES ─────────────────────────────────────────────────
  {
    component: 'Section',
    props: { title: 'Passes', subtitle: 'Class credits. A drop-in is a one-credit pass; attending is what spends one.' },
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
              rows: '$.passes',
              rowKey: 'pass_id',
              empty: 'No passes.',
              columns: [
                { label: 'Pass', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'credits_display' } },
                { label: 'State', px: 92, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
                { label: 'Bought', px: 104, align: 'right', cell: { kind: 'text', key: 'purchased_display', color: 'mute' } },
              ],
            },
          },
        },
        {
          component: 'Row',
          props: { gap: 10, align: 'end', wrap: true },
          children: [
            { component: 'Select', props: { label: 'Sell', options: '$.passOptions', placeholder: 'Choose a pass' }, ref: 'sellOffering', model: '$.sellOfferingId' },
            {
              component: 'Select',
              props: {
                label: 'Paid',
                options: [
                  { value: 'manual', label: 'At the desk' },
                  { value: 'comp', label: 'Complimentary' },
                ],
              },
              ref: 'sellPaidVia',
              model: '$.sellPaidVia',
            },
            { component: 'Button', props: { variant: 'outline', label: 'Sell pass' }, ref: 'sellPass' },
          ],
        },
      ],
    },
  },

  {
    component: 'Section',
    props: { title: 'Courses', subtitle: 'Blocks this person is on. Joining holds their place for every week of it.' },
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
]);

export const peopleFormLayout: LayoutNode = page([
  { component: 'Hero', props: { eyebrow: '$.member.person_name', title: 'Edit person' } },

  {
    component: 'Card',
    props: { pad: 22 },
    children: {
      component: 'Stack',
      props: { gap: 18, maxWidth: 460 },
      children: [
        // No status field, deliberately: what a person IS derives from what
        // they hold, and the writes that change that live on the record —
        // start a plan, sell a pass, give notice. This form edits the anchor.
        {
          component: 'Input',
          props: { label: 'Free trial until', type: 'date', hint: 'The window closes on its own — nothing marks it.' },
          ref: 'trialEndsOn',
          model: '$.trialEndsOn',
        },
        {
          component: 'Textarea',
          props: { label: 'Notes', rows: 5, placeholder: 'Anything the desk should know.', hint: 'Internal only — the member never sees this.' },
          ref: 'notes',
          model: '$.notes',
        },
        // THE ONLY PLACE A YES CAN BE RECORDED. Class reminders and booking
        // confirmations need no permission — they asked for the class. This is
        // for everything else, and without it the studio's win-back automation
        // reaches nobody at all, which is correct and looks broken.
        {
          component: 'Switch',
          props: {
            label: 'May we email them news and offers?',
            hint: 'Reminders about their own classes go out either way. This is for anything else — and they can take it back from any email.',
          },
          ref: 'marketingOk',
          model: '$.marketingOk',
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

export const peopleSignupLayout: LayoutNode = page([
  {
    // Done and not-done are the same screen with the middle swapped, so the
    // heading never jumps and a kiosk never looks like it navigated.
    if: '$.done',
    then: {
      component: 'Stack',
      props: { gap: 22 },
      children: [
        { component: 'Hero', props: { title: '$.signedUpName', lead: 'is on the roll and can be booked from today.' } },
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
        { component: 'Hero', props: { title: 'New person', lead: 'Name and email are all we need. Everything else can wait.' } },
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
              // No "starting as" select: being written down IS the relationship,
              // and everything else (a plan, a pass, a course) is granted from
              // their record. What they ARE is never chosen from a dropdown.
              {
                component: 'Input',
                props: { label: 'Free trial until', type: 'date', hint: 'Leave empty for no trial window.' },
                ref: 'newTrialEndsOn',
                model: '$.newTrialEndsOn',
              },
              { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
              {
                component: 'Row',
                props: { gap: 10 },
                children: [
                  { component: 'Button', props: { variant: 'solid', big: true, label: 'Add them', disabled: '$.blocked' }, ref: 'create' },
                ],
              },
            ],
          },
        },
      ],
    },
  },
]);
