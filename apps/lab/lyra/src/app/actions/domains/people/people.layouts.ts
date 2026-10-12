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
      { component: 'Select', props: { label: 'What they hold', options: '$.holdings', value: '$.holding' }, ref: 'holding' },
    ],
  },

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
    props: { title: 'Family', subtitle: 'Children this person may book and pay for.' },
    children: {
      component: 'Card',
      props: { pad: 18 },
      children: [
        {
          if: '$.family',
          then: {
            component: 'Rows',
            props: { gap: 10 },
            children: {
              for: '$.family',
              as: 'child',
              key: 'person_id',
              do: {
                component: 'Row',
                props: { gap: 12, align: 'center' },
                children: [
                  { component: 'Text', props: { weight: 'medium' }, children: '$.child.name' },
                  { component: 'Text', props: { color: 'faint' }, children: '$.child.born_display' },
                ],
              },
            },
          },
          else: { component: 'Text', props: { color: 'faint' }, children: 'Nobody yet.' },
        },
        {
          if: '$.addingChild',
          then: {
            component: 'Rows',
            props: { gap: 12 },
            children: [
              { component: 'Input', props: { label: 'Name', big: true, placeholder: 'Emma Klein' }, ref: 'childName', model: '$.childName' },
              { component: 'Input', props: { label: 'Date of birth', type: 'date', hint: 'Kids’ classes are grouped by age.' }, ref: 'childBornOn', model: '$.childBornOn' },
              {
                component: 'Row',
                props: { gap: 10 },
                children: [
                  { component: 'Button', props: { variant: 'solid', label: 'Add child' }, ref: 'saveChild' },
                  { component: 'Button', props: { variant: 'ghost', label: 'Cancel' }, ref: 'cancelChild' },
                ],
              },
            ],
          },
          else: { component: 'Button', props: { variant: 'ghost', label: 'Add a child' }, ref: 'addChild' },
        },
      ],
    },
  },
  {
    component: 'Section',
    props: { title: 'Notes', subtitle: 'What the desk has written down. Members never see this.' },
    children: {
      component: 'Card',
      props: {},
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
              { component: 'Field', props: { label: 'Minimum term', phrase: '$.subscription.term_display' } },
              { component: 'Field', props: { label: 'Notice', phrase: '$.subscription.notice_display' } },
              { component: 'Field', props: { label: 'Committed until', value: '$.subscription.committed_display', empty: 'No commitment' } },
              { component: 'Field', props: { label: 'Paid', phrase: '$.subscription.paid_via_display' } },
              { component: 'Field', props: { label: 'Paid until', value: '$.subscription.paid_until_display', empty: 'Nothing recorded' } },
            ],
          },
          {
            component: 'Row',
            props: { gap: 10, align: 'end', wrap: true },
            children: [
              { component: 'Input', props: { label: 'Covered until', type: 'date' }, ref: 'paidUntil', model: '$.paidUntil' },
              { component: 'Button', props: { variant: 'outline', label: 'Record payment' }, ref: 'recordPayment' },
            ],
          },
          {
            if: '$.subscription.notice_given',
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
          component: 'Card',
          props: { flush: true },
          children: {
            component: 'Rows',
            props: {
              rows: '$.purchases',
              rowKey: 'purchase_id',
              empty: 'Nothing bought outright.',
              columns: [
                { label: 'Bought', w: 2, cell: { kind: 'primary', key: 'name', subKey: 'paid_via_display' } },
                { label: 'Paid', px: 92, align: 'right', cell: { kind: 'text', key: 'amount_display', color: 'ink' } },
                { label: 'When', px: 104, align: 'right', cell: { kind: 'text', key: 'purchased_display', color: 'mute' } },
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
    if: '$.done',
    then: {
      component: 'Stack',
      props: { gap: 22 },
      children: [
        {
          component: 'Hero',
          props: {
            title: '$.signedUpName',
            lead: '$.standingLine',
          },
        },
        {
          component: 'Card',
          props: { pad: 22 },
          children: {
            component: 'Stack',
            props: { gap: 16, maxWidth: 480 },
            children: [
              {
                if: '$.onAPlan',
                then: '',
                else: {
                  component: 'Stack',
                  props: { gap: 12 },
                  children: [
                    { component: 'Text', props: { size: 'sm', color: 'mute' }, children: 'Put them on something now, or leave it — they are on the roll either way.' },
                    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },
                    {
                      component: 'Row',
                      props: { gap: 10, align: 'end', wrap: true },
                      children: [
                        { component: 'Select', props: { label: 'Plan', options: '$.planOptions', placeholder: 'Choose a plan' }, ref: 'signupOffering', model: '$.signupOfferingId' },
                        {
                          component: 'Select',
                          props: {
                            label: 'Paid',
                            options: [
                              { value: 'manual', label: 'The studio bills them' },
                              { value: 'stripe', label: 'Card, online' },
                              { value: 'comp', label: 'Complimentary' },
                              { value: 'free', label: 'Free' },
                            ],
                          },
                          ref: 'signupPaidVia',
                          model: '$.signupPaidVia',
                        },
                        { component: 'Button', props: { variant: 'solid', label: 'Start it', disabled: '$.starting' }, ref: 'startAtSignup' },
                      ],
                    },
                  ],
                },
              },
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
