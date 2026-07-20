import {
  createShell,
  type ActionDefinition,
  type FetchFn,
  type FunctionHandler,
} from '@niscorp/nova';
import { Nova } from '@niscorp/nova/adapters/react';

// HTTP and function endpoints coexist in the same `endpoints` map.
// `call` dispatches either, picked by the descriptor shape (`url` vs
// `fn`). The success chain below fetches a user over HTTP, then runs
// a local function to enrich the payload — all through the same
// step executor, error scope, and target-write plumbing.
//
// The "force fail" button exercises the function's error branch: the
// handler throws, `@error.message` is bound on the onError scope, and
// the data store writes to `errorTarget` identical to an HTTP failure.

const fakeFetch: FetchFn = async (url) => {
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  if (url.includes('/broken')) {
    return {
      ok: false,
      status: 500,
      json: async () => ({ message: 'HTTP failed' }),
      text: async () => '{"message":"HTTP failed"}',
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: 'u_001', name: 'ada lovelace', joined: '2017-06-22' }),
    text: async () =>
      '{"id":"u_001","name":"ada lovelace","joined":"2017-06-22"}',
  };
};

const enrichUser: FunctionHandler = async (data) => {
  const user = data['user'] as { name: string; joined: string };
  return {
    display: user.name.toUpperCase(),
    tenureYears: 2026 - Number(user.joined.slice(0, 4)),
  };
};

const brokenFunction: FunctionHandler = async () => {
  throw new Error('local transform blew up');
};

const mixedEndpoints: ActionDefinition = {
  id: 'function-endpoint-mixed',
  data: {
    loading: false,
    user: undefined,
    profile: undefined,
    error: '',
  },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      { component: 'Text', props: { weight: 'bold', size: 'xl' }, children: 'Mixed endpoints' },
      {
        component: 'Text',
        props: { color: '#6b7280' },
        children: 'HTTP fetch → local enrichment in one chain.',
      },
      {
        component: 'Stack',
        props: { direction: 'row', gap: 8 },
        children: [
          { component: 'Button', ref: 'run', children: 'Load & enrich' },
          {
            component: 'Button',
            ref: 'fail',
            props: { variant: 'secondary' },
            children: 'Load & enrich (force fail)',
          },
        ],
      },
      { if: '$.loading', then: { component: 'Text', children: 'Working...' } },
      {
        if: '$.profile',
        then: {
          component: 'Box',
          props: { padding: 12, background: '#dcfce7', radius: 6 },
          children: {
            component: 'Stack',
            props: { direction: 'column', gap: 4 },
            children: [
              { component: 'Text', props: { weight: 'bold' }, children: '{{$.profile.display}}' },
              {
                component: 'Text',
                props: { size: 'sm', color: '#166534' },
                children: 'Tenure: {{$.profile.tenureYears}} years',
              },
            ],
          },
        },
      },
      {
        if: '$.error',
        then: {
          component: 'Box',
          props: { padding: 12, background: '#fee2e2', radius: 6 },
          children: {
            component: 'Text',
            props: { color: '#991b1b' },
            children: '\u2717 {{$.error}}',
          },
        },
      },
    ],
  },
  endpoints: {
    loadUser: {
      url: '/api/users/me',
      method: 'GET',
      target: 'user',
    },
    enrich: { fn: 'enrichUser', target: 'profile' },
    enrichBroken: { fn: 'brokenFunction', target: 'profile' },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'run',
      do: [
        { set: 'loading', value: true },
        { set: 'profile', value: undefined },
        { set: 'error', value: '' },
        {
          call: 'loadUser',
          onSuccess: [
            {
              call: 'enrich',
              onSuccess: [{ set: 'loading', value: false }],
              onError: [
                { set: 'loading', value: false },
                { set: 'error', value: '{{@error.message}}' },
              ],
            },
          ],
          onError: [
            { set: 'loading', value: false },
            { set: 'error', value: '{{@error.message}}' },
          ],
        },
      ],
    },
    {
      event: 'ui:click',
      ref: 'fail',
      do: [
        { set: 'loading', value: true },
        { set: 'profile', value: undefined },
        { set: 'error', value: '' },
        {
          call: 'loadUser',
          onSuccess: [
            {
              call: 'enrichBroken',
              onSuccess: [{ set: 'loading', value: false }],
              onError: [
                { set: 'loading', value: false },
                { set: 'error', value: '{{@error.message}}' },
              ],
            },
          ],
          onError: [
            { set: 'loading', value: false },
            { set: 'error', value: '{{@error.message}}' },
          ],
        },
      ],
    },
  ],
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'function-endpoint-mixed' }],
  actions: { 'function-endpoint-mixed': mixedEndpoints },
  fetch: fakeFetch,
  functions: { enrichUser, brokenFunction },
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
