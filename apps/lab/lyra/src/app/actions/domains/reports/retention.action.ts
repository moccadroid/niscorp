import { z } from 'zod';
import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { membersLapsedAway } from '@lyra/app/vex/tide.entries';
import { revenueAtRisk, revenueCommitted, revenueExpected, revenueLeaving } from '@lyra/app/vex/forecast.entries';

const windowed = (fingerprint: string) => ({ fingerprint, context: { cutoff: { $ref: '$.from' } } });
const plain = (fingerprint: string) => ({ fingerprint, context: {} });

const figure = (label: string, value: string, hint: string): LayoutNode => ({
  component: 'Card',
  props: { pad: 20 },
  children: {
    component: 'Stack',
    props: { gap: 4 },
    children: [
      { component: 'Text', props: { size: 'sm', color: 'mute' }, children: label },
      { component: 'Text', props: { size: 'xl', weight: 'semi' }, children: value },
      { component: 'Text', props: { size: 'sm', color: 'faint' }, children: hint },
    ],
  },
});

const retentionLayout: LayoutNode = {
  component: 'Stack',
  props: { gap: 26 },
  children: [
    {
      component: 'Row',
      props: { justify: 'between', align: 'center', wrap: true, gap: 12 },
      children: [
        { component: 'Hero', props: { title: 'Retention', lead: 'Who is drifting, and what it is worth.' } },
        {
          component: 'Row',
          props: { gap: 6, align: 'center' },
          children: [
            { component: 'Text', props: { size: 'sm', color: 'mute' }, children: '$.rangeLabel' },
            { component: 'Button', props: { variant: 'ghost', label: '30d' }, ref: 'range-30' },
            { component: 'Button', props: { variant: 'ghost', label: '90d' }, ref: 'range-90' },
          ],
        },
      ],
    },

    {
      component: 'Grid',
      props: { min: 240, gap: 18 },
      children: [
        figure('Monthly run rate', '$.runRate.monthly_display', 'every active subscription, normalised'),
        figure('Under contract', '$.committed.monthly_display', 'inside a minimum term'),
        figure('Leaving', '$.leaving.monthly_display', 'notice given, date already fixed'),
      ],
    },

    {
      component: 'Section',
      props: { title: 'Given notice', subtitle: 'Soonest first — the one you can still talk to is at the top.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.atRisk',
            loading: '$.loading',
            rowKey: 'subscription_id',
            empty: 'Nobody is leaving.',
            emptyHint: 'No active subscription has given notice.',
            columns: [
              { label: 'Member', w: 2, cell: { kind: 'primary', key: 'person_name', subKey: 'plan_name' } },
              { label: 'Gave notice', px: 120, cell: { kind: 'text', key: 'notice_display', color: 'soft' } },
              { label: 'Last day', px: 120, cell: { kind: 'text', key: 'ends_display' } },
              { label: 'A month', px: 90, align: 'right', cell: { kind: 'text', key: 'value_display' } },
            ],
          },
        },
      },
    },

    {
      component: 'Section',
      props: { title: 'Gone quiet', subtitle: 'Still paying, not turning up. Nobody has cancelled — yet.' },
      children: {
        component: 'Card',
        props: { flush: true },
        children: {
          component: 'Rows',
          props: {
            rows: '$.quiet',
            loading: '$.loading',
            rowKey: 'subscription_id',
            empty: 'Everybody has been in.',
            emptyHint: 'No active member has missed the whole window.',
            columns: [
              { label: 'Member', w: 2, cell: { kind: 'primary', key: 'person_name' } },
              { label: 'Member since', px: 130, cell: { kind: 'text', key: 'started_on', color: 'soft' } },
            ],
          },
        },
      },
    },
  ],
};

export const retentionAction: ActionDefinition = {
  id: 'reports.retention',
  title: 'Retention',
  data: {
    windowRow: {},
    from: '',
    to: '',
    rangeLabel: 'Last 90 days',
    days: 90,
    runRate: {},
    committed: {},
    leaving: {},
    atRisk: [],
    quiet: [],
    loading: true,
  },
  layout: retentionLayout,
  endpoints: {
    window: { fn: 'reports.window', target: 'windowRow' },
    runRate: { url: '/api/studio/vex', method: 'POST', request: plain(revenueExpected.fingerprint), target: 'runRate' },
    committed: { url: '/api/studio/vex', method: 'POST', request: plain(revenueCommitted.fingerprint), target: 'committed' },
    leaving: { url: '/api/studio/vex', method: 'POST', request: plain(revenueLeaving.fingerprint), target: 'leaving' },
    atRisk: { url: '/api/studio/vex', method: 'POST', request: plain(revenueAtRisk.fingerprint), target: 'atRisk' },
    quiet: { url: '/api/studio/vex', method: 'POST', request: windowed(membersLapsedAway.fingerprint), target: 'quiet' },
  },
  lifecycle: {
    // The window first: `quiet` takes the cutoff as context, and firing it
    // beside the call that resolves the date sends an empty string.
    mount: [
      { call: 'runRate' },
      { call: 'committed' },
      { call: 'leaving' },
      { call: 'atRisk' },
      {
        call: 'window',
        onSuccess: [
          { set: 'from', value: '$.windowRow.from' },
          { set: 'rangeLabel', value: '$.windowRow.label' },
          { call: 'quiet', onSuccess: [{ set: 'loading', value: false }] },
        ],
      },
    ],
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'range-30',
      do: [{ set: 'days', value: 30 }, { call: 'window', onSuccess: [{ set: 'from', value: '$.windowRow.from' }, { set: 'rangeLabel', value: '$.windowRow.label' }, { call: 'quiet' }] }],
    },
    {
      event: 'ui:click',
      ref: 'range-90',
      do: [{ set: 'days', value: 90 }, { call: 'window', onSuccess: [{ set: 'from', value: '$.windowRow.from' }, { set: 'rangeLabel', value: '$.windowRow.label' }, { call: 'quiet' }] }],
    },
    // A cancellation or a check-in moves both halves of this screen.
    { message: 'members-changed', do: [{ call: 'runRate' }, { call: 'committed' }, { call: 'leaving' }, { call: 'atRisk' }] },
    { message: 'check-ins-changed', do: [{ call: 'quiet' }] },
  ],
};

export const retentionInputSchema = z.toJSONSchema(z.object({}));
