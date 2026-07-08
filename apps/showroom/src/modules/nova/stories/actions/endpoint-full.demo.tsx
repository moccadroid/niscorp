import {
  createShell,
  type ActionDefinition,
  type FetchFn,
} from '@niscorp/nova';
import { Nova } from '@niscorp/nova/react';
import { evaluate } from '@niscorp/prism';

// Full endpoint surface: templated URL, headers, and a `request` transform
// that builds the body from the action data; separate success and error
// chains; an `emit` on success; and a deliberate failure variant that reads
// `@error.message` from the onError scope.

const fakeFetch: FetchFn = async (url) => {
  await new Promise<void>((resolve) => setTimeout(resolve, 400));
  if (url.includes('/broken')) {
    return {
      ok: false,
      status: 500,
      json: async () => ({ message: 'Internal server error from mock' }),
      text: async () => '{"message":"Internal server error from mock"}',
    };
  }
  return {
    ok: true,
    status: 200,
    json: async () => ({ id: 'u_001', name: 'Ada Lovelace', savedAt: '2026-04-07' }),
    text: async () => '{"id":"u_001","name":"Ada Lovelace","savedAt":"2026-04-07"}',
  };
};

const endpointFull: ActionDefinition = {
  id: 'endpoint-full',
  data: {
    userId: 'u_123',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    loading: false,
    success: false,
    error: '',
    savedUser: undefined,
    errorPayload: undefined,
  },
  layout: {
    component: 'Stack',
    props: { direction: 'column', gap: 16, padding: 24 },
    children: [
      {
        component: 'Text',
        props: { weight: 'bold', size: 'xl' },
        children: 'Save user',
      },
      {
        component: 'Stack',
        props: { direction: 'column', gap: 8 },
        children: [
          { component: 'Text', children: 'User ID' },
          { component: 'Input', model: '$.userId', props: { placeholder: 'u_123' } },
        ],
      },
      {
        component: 'Stack',
        props: { direction: 'column', gap: 8 },
        children: [
          { component: 'Text', children: 'Name' },
          { component: 'Input', model: '$.name', props: { placeholder: 'Ada Lovelace' } },
        ],
      },
      {
        component: 'Stack',
        props: { direction: 'column', gap: 8 },
        children: [
          { component: 'Text', children: 'Email' },
          { component: 'Input', model: '$.email', props: { placeholder: 'ada@example.com' } },
        ],
      },
      {
        component: 'Stack',
        props: { direction: 'row', gap: 8 },
        children: [
          { component: 'Button', ref: 'save', children: 'Save' },
          {
            component: 'Button',
            ref: 'fail',
            props: { variant: 'secondary' },
            children: 'Save (force fail)',
          },
        ],
      },
      { if: '$.loading', then: { component: 'Text', children: 'Saving...' } },
      {
        if: '$.success',
        then: {
          component: 'Box',
          props: { padding: 12, background: '#dcfce7', radius: 6 },
          children: {
            component: 'Text',
            props: { color: '#166534', weight: 'bold' },
            children: '\u2713 Saved successfully',
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
    saveUser: {
      url: '/api/users/{{$.userId}}',
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': '{{$.userId}}-{{$.name}}',
      },
      request: { name: { $ref: '$.name' }, email: { $ref: '$.email' } },
      target: 'savedUser',
      errorTarget: 'errorPayload',
    },
    saveUserBroken: {
      url: '/api/broken',
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      request: { name: { $ref: '$.name' }, email: { $ref: '$.email' } },
      target: 'savedUser',
      errorTarget: 'errorPayload',
    },
  },
  triggers: [
    {
      event: 'ui:click',
      ref: 'save',
      do: [
        { set: 'loading', value: true },
        { set: 'success', value: false },
        { set: 'error', value: '' },
        {
          call: 'saveUser',
          onSuccess: [
            { set: 'loading', value: false },
            { set: 'success', value: true },
            { emit: { channel: 'user-saved' } },
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
        { set: 'success', value: false },
        { set: 'error', value: '' },
        {
          call: 'saveUserBroken',
          onSuccess: [
            { set: 'loading', value: false },
            { set: 'success', value: true },
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
  canvases: [{ id: 'main', initial: 'endpoint-full' }],
  actions: { 'endpoint-full': endpointFull },
  fetch: fakeFetch,
  // Prism runs the endpoint `request` transform over the action data.
  transform: (config, source) =>
    evaluate(config as Parameters<typeof evaluate>[0], source as Parameters<typeof evaluate>[1]),
});

export { shell };

export const Demo = () => <Nova.Shell shell={shell} />;
