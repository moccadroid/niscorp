import type { FetchFn } from '@niscorp/nova';
import type { ActionStory } from '../../story-types';

const fakeFetch: FetchFn = async (_url) => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 300);
  });
  const body = '{"name":"Ada Lovelace"}';
  return {
    ok: true,
    status: 200,
    json: async () => ({ name: 'Ada Lovelace' }),
    text: async () => body,
  };
};

export const endpointStory: ActionStory = {
  id: 'endpoint',
  name: 'Endpoint call',
  description:
    'Demonstrates an action `endpoints` definition with a `call` op. Click "Load user" — the trigger sets `loading: true`, calls the `getUser` endpoint against a mock fetch, writes the response to `$.user`, and clears `loading`. The conditional Texts show the loading spinner, then the user name once the call resolves.',
  kind: 'action',
  category: 'Endpoints',
  action: {
    id: 'endpoint',
    data: { loading: false, user: undefined, error: undefined },
    layout: {
      component: 'Stack',
      props: { direction: 'column', gap: 16, padding: 24 },
      children: [
        {
          if: '$.loading',
          then: { component: 'Text', children: 'Loading...' },
        },
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
  },
  fetch: fakeFetch,
  expected: { textIncludes: ['Load user'] },
};
