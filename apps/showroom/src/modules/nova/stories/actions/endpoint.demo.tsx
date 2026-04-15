import {
  createShell,
  type ActionDefinition,
  type FetchFn,
} from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';

// A mocked network call. The real code path is the same: a `call`
// op dispatches an endpoint, Nova awaits the response, and writes
// it to the configured `target` path. Click "Load user" — watch
// the spinner appear, then the user name.

const fakeFetch: FetchFn = async () => {
  await new Promise<void>((resolve) => setTimeout(resolve, 300));
  return {
    ok: true,
    status: 200,
    json: async () => ({ name: 'Ada Lovelace' }),
    text: async () => '{"name":"Ada Lovelace"}',
  };
};

const endpoint: ActionDefinition = {
  id: 'endpoint',
  data: { loading: false, user: undefined, error: undefined },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      { if: '$.loading', then: { component: 'Text', children: 'Loading...' } },
      {
        if: '$.user',
        then: {
          component: 'Text',
          props: { weight: 'bold' },
          children: 'User: {{$.user.name}}',
        },
      },
      {
        if: '$.error',
        then: {
          component: 'Text',
          props: { color: '#dc2626' },
          children: 'Error: {{$.error.message}}',
        },
      },
      { component: 'Button', ref: 'load', children: 'Load user' },
    ],
  },
  endpoints: {
    getUser: {
      url: '/api/user',
      method: 'GET',
      target: 'user',
      errorTarget: 'error',
    },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'load',
      do: [
        { set: 'loading', value: true },
        { set: 'error', value: undefined },
        {
          call: 'getUser',
          onSuccess: [{ set: 'loading', value: false }],
          onError: [{ set: 'loading', value: false }],
        },
      ],
    },
  ],
};

const shell = createShell({
  canvases: [{ id: 'main', initial: 'endpoint' }],
  actions: { endpoint },
  fetch: fakeFetch,
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
