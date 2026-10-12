import { describe, it, expect, expectTypeOf } from 'vitest';
import type { z } from 'zod';
import type { RenderNode } from '@niscorp/nova';
import { ClientMessageSchema, PROTOCOL, ServerMessageSchema } from '../src/protocol';
import type { ClientMessage, ServerMessage } from '../src/protocol';
import { RenderNodeSchema, renderNodeShapes } from '../src/protocol/messages';

describe('protocol — a rendered node', () => {
  it('is, as a schema, exactly the type nova gives it', () => {
    expectTypeOf<z.infer<typeof renderNodeShapes>>().toEqualTypeOf<RenderNode>();
  });

  it('every kind of node, with everything a node may carry, is read back as it was written', () => {
    const tree: RenderNode[] = [
      {
        type: 'component',
        name: 'Rows',
        props: { gap: 8, columns: [{ label: 'Todo', w: 1 }], empty: null },
        ref: 'rows',
        key: 'k1',
        model: { path: 'query', ref: 'search' },
        children: [
          { type: 'text', value: 'a row', key: 'k2' },
          { type: 'fragment', key: 'k3', children: [{ type: 'error', code: 'COMPONENT_NOT_FOUND', message: 'no such component', nodeRef: 'gone', key: 'k4' }] },
        ],
      },
    ];
    expect(RenderNodeSchema.array().parse(JSON.parse(JSON.stringify(tree)))).toEqual(tree);
  });
});

describe('protocol — the messages', () => {
  const tree: RenderNode[] = [{ type: 'text', value: 'row' }];

  it('everything the server may say is read back as it was said', () => {
    const said: ServerMessage[] = [
      { type: 'hello', protocol: PROTOCOL, principal: null, catalog: { actions: ['home'], hash: 'abc' } },
      { type: 'catalog', actions: ['home'], hash: 'abc' },
      { type: 'frame', tree },
      { type: 'render', canvas: 'main', tree },
      { type: 'render-delta', canvas: 'main', ops: [[0, 0, 16], [1, 'x']], hash: 7 },
      { type: 'session', token: 'st_1' },
      { type: 'session', sealed: 'c2VhbGVk' },
      { type: 'error', code: 'no_shell', message: 'This app serves no shell.' },
      { type: 'error', code: 'no_shell', message: 'This app serves no shell.', canvas: 'main' },
    ];
    for (const message of said) expect(ServerMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });

  it('everything a terminal may say is read back as it was said', () => {
    const said: ClientMessage[] = [
      { type: 'event', canvas: 'main', event: { type: 'ui:click', ref: 'save', payload: { id: 7 } } },
      { type: 'publish', channel: 'refresh' },
      { type: 'publish', channel: 'sel', payload: [1, 2] },
      { type: 'popTo', canvas: 'main', instance: 'a1' },
      { type: 'back' },
      { type: 'resync' },
      { type: 'reset' },
    ];
    for (const message of said) expect(ClientMessageSchema.parse(JSON.parse(JSON.stringify(message)))).toEqual(message);
  });

  it('a session is a token or a sealed sign-in, never both', () => {
    expect(ServerMessageSchema.safeParse({ type: 'session', token: 'st_1', sealed: 'c2VhbGVk' }).success).toBe(false);
  });
});
