import { z } from 'zod';
import type { ActionDefinition, LayoutNode, Step } from '@niscorp/nova';

// ═══════════════════════════════════════════════════════════════
// WHO GETS IT — asked for, not shown by default.
//
// ONLY THE PEOPLE WHO WILL RECEIVE IT. The ones who will not are not the
// owner's business here: they did not opt in, or they have no address, or the
// provider told us not to write to them, and none of those is a decision
// anybody is being asked to make on this screen. The compose page's number
// says how many there are; this says who they are, when somebody wants to
// know, and lets them strike one off.
//
// A SHEET IS RIGHT FOR THIS and wrong for composing. This is a detail you open,
// glance at and close — the shape a sheet has always been for.
// ═══════════════════════════════════════════════════════════════

const person = (name: string) => ({ $get: { from: { $var: 'p' }, path: [name] } });

const struckOff = (id: unknown): Record<string, unknown> => ({
  $gt: [{ $length: { $filter: { over: { $ref: '$.excluded' }, as: 'x', when: { $eq: [{ $var: 'x' }, id] } } } }, 0],
});

/** The people this send would reach, and the ticks over them. Both derived
 *  from the same read in one step, so a name and its checkbox cannot disagree. */
const REBUILD: Step[] = [
  {
    set: 'recipients',
    value: {
      $prism: {
        $filter: {
          over: { $ref: '$.people' },
          as: 'p',
          when: { $eq: [person('disposition'), 'ok'] },
        },
      },
    },
  },
  {
    set: 'ticked',
    value: {
      $prism: {
        $map: {
          over: {
            $filter: {
              over: { $ref: '$.people' },
              as: 'p',
              when: { $and: [{ $eq: [person('disposition'), 'ok'] }, { $not: struckOff(person('person_id')) }] },
            },
          },
          as: 'p',
          body: person('person_id'),
        },
      },
    },
  },
];

const recipientsLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 14 },
  children: [
    { component: 'Text', props: { size: 'sm', color: 'mute', phrase: '$.counted.ok_display' } },
    {
      component: 'Card',
      props: { flush: true },
      children: {
        component: 'Rows',
        props: {
          rows: '$.recipients',
          loading: '$.loading',
          rowKey: 'person_id',
          empty: 'Nobody in this list can be written to.',
          emptyHint: 'Everybody here has either not opted in or has no address.',
          selectRef: 'tick',
          selectedKeys: '$.ticked',
          columns: [{ label: 'Name', w: 2, cell: { kind: 'primary', key: 'person_name' } }],
        },
      },
    },
    { component: 'Button', props: { variant: 'solid', big: true, label: 'Done' }, ref: 'done' },
  ],
};

export const campaignRecipientsAction: ActionDefinition = {
  id: 'campaigns.recipients',
  title: 'Who gets it',
  data: {
    audience: '',
    cutoff: '',
    excluded: [],
    people: [],
    recipients: [],
    ticked: [],
    counted: {},
    toggleId: '',
    loading: true,
    error: '',
  },
  layout: recipientsLayout,
  endpoints: {
    page: {
      url: '/api/campaigns/vex',
      method: 'POST',
      request: { fingerprint: 'campaigns/audience-page', context: { audience: { $ref: '$.audience' }, cutoff: { $ref: '$.cutoff' } } },
      target: 'people',
      errorTarget: 'error',
    },
    counted: {
      url: '/api/campaigns/vex',
      method: 'POST',
      request: {
        fingerprint: 'campaigns/audience-writable',
        context: { audience: { $ref: '$.audience' }, cutoff: { $ref: '$.cutoff' }, except: { $ref: '$.excluded' } },
      },
      target: 'counted',
    },
  },
  lifecycle: { mount: [{ call: 'counted' }, { call: 'page', onSuccess: [{ set: 'loading', value: false }, { emit: { channel: 'rebuild' } }] }] },
  triggers: [
    { message: 'rebuild', do: REBUILD },
    {
      event: 'ui:click',
      ref: 'tick',
      do: [{ set: 'toggleId', value: '@event.payload.person_id' }, { emit: { channel: 'toggle' } }],
    },
    {
      message: 'toggle',
      do: [
        {
          set: 'excluded',
          value: {
            $prism: {
              $case: {
                branches: [
                  // The header box sends `{ all: true }` and no person: everybody
                  // back on.
                  { when: { $not: { $ref: '$.toggleId' } }, then: [] },
                  {
                    when: struckOff({ $ref: '$.toggleId' }),
                    then: { $filter: { over: { $ref: '$.excluded' }, as: 'x', when: { $neq: [{ $var: 'x' }, { $ref: '$.toggleId' }] } } },
                  },
                ],
                else: { $flatten: [{ $ref: '$.excluded' }, [{ $ref: '$.toggleId' }]] },
              },
            },
          },
        },
        { emit: { channel: 'settled' } },
      ],
    },
    { message: 'settled', do: [...REBUILD, { call: 'counted' }] },

    // ── HANDING THE CHOICE BACK ──────────────────────────────
    //
    // ON CLOSE, NOT ON EVERY TICK, and that is nova's rule rather than a
    // preference: the page underneath is SUSPENDED while this sits over it,
    // and a suspended action reacts to nothing. A message published while the
    // sheet is open is a message nobody hears. Emitting as the sheet goes
    // works because publishing is queued to a microtask — the pop resumes the
    // page first, and the announcement lands on something live. (The confirm
    // pattern in nova's own runtime does exactly this.)
    //
    // BOTH EXITS COMMIT. The × belongs to the shell's sheet fragment, which
    // pops; this rides the same click so that closing is never a way to
    // silently lose the ticking somebody just did.
    { event: 'ui:click', ref: 'sheetClose', do: [{ emit: { channel: 'recipients-chosen', payload: '$.excluded' } }] },
    { event: 'ui:click', ref: 'done', do: [{ emit: { channel: 'recipients-chosen', payload: '$.excluded' } }, { pop: true }] },
  ],
};

export const campaignRecipientsInputSchema = z.toJSONSchema(
  z.object({ audience: z.string().optional(), cutoff: z.string().optional(), excluded: z.array(z.string()).optional() }),
);
