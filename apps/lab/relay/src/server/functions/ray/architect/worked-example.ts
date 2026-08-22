import type { Producer } from '@niscorp/cortex';

// ═══════════════════════════════════════════════════════════
// THE WORKED EXAMPLE — one complete, correct action, annotated.
//
// Measured 2026-08-22: the architect's 50KB context named `triggers`,
// `endpoints` and `lifecycle` exactly ONCE EACH — as property names inside
// the schema dump — and contained no complete action anywhere. Every model's
// signature failures were SHAPE failures (lifecycle nested inside endpoints,
// triggers misplaced, props hoisted), because every model was writing a
// deeply nested artifact it had never once seen whole. Humans learn Nova by
// copying a hand-authored screen; this producer hands the model the same
// specimen. One correct example teaches what ten DO/DON'T bullets could not.
//
// The example embodies every load-bearing rule at once: string option
// values, set-from-payload before the call, string-path layout bindings,
// $case/$ref only inside the endpoint request, fingerprint + context replay,
// loading cleared on success AND error, ref↔trigger pairing, push with the
// target's input key. Derived from a build that passed live interaction
// probes (month switching verified against SQL truth); the object-option and
// stale-read defects that lineage carried are corrected here.
// ═══════════════════════════════════════════════════════════

const EXAMPLE = {
  id: 'view.deals.byMonth',
  name: 'Deals by Month',
  title: 'Deals by Month',
  // data: every bound/written key exists here with a default.
  data: { deals: [], loading: true, month: 'June' },
  layout: {
    component: 'Stack',
    props: { gap: 2 },
    children: [
      {
        component: 'Row',
        props: { justify: 'space-between', align: 'center' },
        children: [
          // Layout bindings are STRING paths or {{ moustache }} — never transform nodes.
          { component: 'Text', props: { size: 'sm' }, children: '{{$.deals.length}} deals' },
          // Option values are plain STRINGS (the DOM coerces anything else to "").
          {
            component: 'Select',
            ref: 'monthSelect',
            model: '$.month',
            props: {
              label: 'Month',
              options: [
                { value: 'June', label: 'June' },
                { value: 'July', label: 'July' },
                { value: 'August', label: 'August' },
              ],
            },
          },
        ],
      },
      {
        component: 'Table',
        props: {
          rows: '$.deals',
          loading: '$.loading',
          empty: 'No deals close in this month.',
          rowKey: 'id',
          rowRef: 'dealRow',
          columns: [
            { label: 'Title', cell: { kind: 'primary', key: 'title' } },
            { label: 'Company', cell: { kind: 'text', key: 'company_name' } },
            { label: 'Value', align: 'end', cell: { kind: 'text', key: 'value_display', mono: true } },
            { label: 'Close Date', cell: { kind: 'text', key: 'close_date_display' } },
          ],
        },
      },
    ],
  },
  triggers: [
    {
      event: 'ui:model',
      ref: 'monthSelect',
      // FIRST set the bound key from @event.payload, THEN call — the model
      // write races the trigger; skipping the set reads the previous value.
      do: [
        { set: 'month', value: '@event.payload' },
        { set: 'loading', value: true },
        {
          call: 'loadDeals',
          onSuccess: [{ set: 'loading', value: false }],
          onError: [{ set: 'loading', value: false }],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'dealRow',
      do: [{ push: { action: 'crm.deal.view', input: { id: '@event.payload' } } }],
    },
  ],
  endpoints: {
    loadDeals: {
      url: '/api/vex',
      method: 'POST',
      // The fingerprint comes from YOUR query result — proven this build,
      // pasted character for character. Transform nodes ($case/$ref/$join)
      // live HERE, in the request, and only here.
      request: {
        fingerprint: '<paste the fingerprint from your query result>',
        context: {
          start: {
            $case: {
              branches: [
                { when: { $eq: [{ $ref: '$.month' }, 'June'] }, then: '2026-06-01' },
                { when: { $eq: [{ $ref: '$.month' }, 'July'] }, then: '2026-07-01' },
              ],
              else: '2026-08-01',
            },
          },
          end: {
            $case: {
              branches: [
                { when: { $eq: [{ $ref: '$.month' }, 'June'] }, then: '2026-06-30' },
                { when: { $eq: [{ $ref: '$.month' }, 'July'] }, then: '2026-07-31' },
              ],
              else: '2026-08-31',
            },
          },
        },
      },
      // The reply IS the rows; `target` receives them. No `response` needed.
      target: 'deals',
    },
  },
  lifecycle: {
    mount: [
      {
        call: 'loadDeals',
        onSuccess: [{ set: 'loading', value: false }],
        onError: [{ set: 'loading', value: false }],
      },
    ],
  },
};

export const workedExample = (() =>
  [
    'WORKED EXAMPLE — one complete, correct action. Model yours on this structure. The five top-level',
    'sections (data / layout / triggers / endpoints / lifecycle) are SIBLINGS — never nested inside each other:',
    JSON.stringify(EXAMPLE, null, 1),
  ].join('\n')) satisfies Producer;
