import type { LayoutNode } from '@niscorp/nova';

// WHAT HAPPENS WHEN NOBODY IS LOOKING — made lookable.
//
// The automations worked before this screen existed, which is exactly the
// problem: a subsystem that lapses memberships overnight and cannot be seen is
// one nobody can be responsible for. Every row here leads with the reflex's
// INTENT — one factual sentence in the operator's language, which the reflex
// schema demands for this reason and no other.
//
// Three controls, in order of how safe they are:
//   Preview — runs the real pipeline, changes nothing, says what it would do.
//   Run     — does it now. Works on a paused automation, because pausing gates
//             the clock rather than the person.
//   Pause   — stops the clock without deleting anything.
export const automationsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 22 },
  children: [
    {
      component: 'Hero',
      props: {
        title: 'Automations',
        lead: 'What this studio does overnight. Preview one to see exactly what it would change before it changes anything.',
      },
    },

    { component: 'Row', props: { justify: 'end' }, children: [{ component: 'Button', props: { variant: 'solid', label: 'Add an automation' }, ref: 'add' }] },

    { if: '$.error', then: { component: 'Notice', props: { tone: 'alert', message: '$.error' } }, else: '' },

    // CREATE AND EDIT. What a studio authors is a SHAPE plus its knobs —
    // never a fingerprint and never a template expression. The dangerous half
    // stays authored in code, which is what makes this form safe to hand to
    // somebody who has never seen a database.

    // ONE TABLE.
    //
    // This was two: "Set up" (the rows) above "What it does" (the loaded
    // reflexes), listing the same three automations twice with the controls
    // split between them — you changed the schedule in the first and paused in
    // the second, and nothing said they were the same thing.
    //
    // The name is the LABEL now, not the template id. An operator was being
    // shown "trials.lapse" and asked to be responsible for what it does at four
    // in the morning; the catalog has carried a human name and a one-sentence
    // intent all along.
    //
    // And "Change" is a control rather than a row you have to guess is
    // tappable. Tapping the row still works — it is just no longer the only way
    // to find out that editing exists.
    // What just happened, when you ran or paused one by hand.
    { if: '$.notice', then: { component: 'Notice', props: { tone: 'good', message: '$.notice' } }, else: '' },

    {
      component: 'Section',
      props: { title: 'What this studio runs', subtitle: 'Each one is shipped and previewable. Change when it runs, or look before it acts.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.reflexes',
            rowKey: 'automation_id',
            onRowRef: 'edit',
            loading: '$.loading',
            empty: 'No automations yet.',
            emptyHint: 'Add one and the studio starts doing it overnight.',
            columns: [
              // NO SUBTITLE. The composed name — 'Mark the trial lapsed —
              // trials past their window' — already says what it does and to
              // whom; the blurb under it said the same thing twice and forced
              // a three-line wrap in a column nine others were squeezing.
              // The long version is in the form, where you are deciding.
              { label: 'What it does', w: 4, cell: { kind: 'primary', key: 'name' } },
              { label: 'When', px: 96, cell: { kind: 'text', key: 'run_display', color: 'soft' } },
              { label: 'State', px: 96, cell: { kind: 'badge', key: 'state_label', toneKey: 'state_tone' } },
              { label: 'Last run', px: 96, cell: { kind: 'badge', key: 'last_outcome', toneKey: 'last_tone' } },
              { label: '', px: 92, align: 'right', cell: { kind: 'action', label: 'Preview', ref: 'preview', variant: 'outline' } },
              { label: '', px: 76, align: 'right', cell: { kind: 'action', label: 'Run', ref: 'run', variant: 'ghost' } },
              { label: '', px: 84, align: 'right', cell: { kind: 'action', label: 'Pause', ref: 'pause', variant: 'ghost', showKey: 'enabled' } },
              { label: '', px: 84, align: 'right', cell: { kind: 'action', label: 'Arm', ref: 'arm', variant: 'outline', hideKey: 'enabled' } },
            ],
          },
        },
      },
    },

    {
      if: '$.previewOpen',
      then: {
        component: 'Section',
        props: { title: '$.previewName', subtitle: 'A dry run. Nothing below has happened.' },
        children: {
          component: 'Card',
          props: { pad: 22 },
          children: {
            component: 'Stack',
            props: { gap: 14 },
            children: [
              { component: 'Notice', props: { tone: 'calm', message: '$.previewSummary' } },
              {
                component: 'Rows',
                props: {
                  rows: '$.previewUnits',
                  rowKey: 'unit',
                  empty: 'Nothing is due. That is an ordinary answer, not a failure.',
                  columns: [{ label: 'Would act on', w: 1, cell: { kind: 'text', key: 'unit', color: 'ink', mono: true } }],
                },
              },
              { component: 'Button', props: { variant: 'ghost', label: 'Close' }, ref: 'closePreview' },
            ],
          },
        },
      },
      else: '',
    },

    // What the automations have actually said. The ledger is about firings;
    // this is about outcomes a human reads.
    {
      component: 'Section',
      props: { title: 'Messages', subtitle: 'What the automations have left for this studio. No email is sent yet — a message you can query beats one in a provider’s logs.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.notifications',
            rowKey: 'notification_id',
            empty: 'Nothing yet. Run one above and it will show up here.',
            columns: [
              { label: 'Message', w: 2, cell: { kind: 'primary', key: 'subject', subKey: 'body' } },
              { label: 'Kind', px: 128, cell: { kind: 'text', key: 'kind' } },
              { label: 'When', px: 120, cell: { kind: 'text', key: 'created_on' } },
            ],
          },
        },
      },
    },
  ],
};
