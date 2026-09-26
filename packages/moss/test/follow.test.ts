import { describe, it, expect } from 'vitest';
import type { QueryResponse } from '@niscorp/vex';
import type { FetchFn } from '@niscorp/nova';
import { createWireFollower } from '../src/follow';
import { createShellHost } from '../src/shells';
import type { ShellHostContext } from '../src/shells';
import type { NiscApp } from '../src/app';
import type { Connection } from '../src/socket';

// A shell's reactive read: vex calls the follower back, nova gets a later
// body through the response's `onChange`, and a terminal receives a new frame.
// Nobody in between knows why.

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const answer = (result: unknown): QueryResponse => ({ result: result as QueryResponse['result'], meta: { cache: { hit: true }, context: {} } });

describe('wire follower', () => {
  it('passes later answers to the subscriber', () => {
    const follower = createWireFollower(new AbortController().signal);
    const bodies: unknown[] = [];
    follower.onChange((body) => bodies.push(body));
    follower.live.onChange(answer(['a']));
    expect(bodies).toEqual([['a']]);
  });

  it('holds an answer that changed before anybody subscribed, and hands it over', () => {
    const follower = createWireFollower(new AbortController().signal);
    follower.live.onChange(answer(['early']));
    const bodies: unknown[] = [];
    follower.onChange((body) => bodies.push(body));
    expect(bodies).toEqual([['early']]);
  });

  it('ends when the call is aborted', () => {
    const call = new AbortController();
    const follower = createWireFollower(call.signal);
    call.abort();
    expect(follower.live.signal.aborted).toBe(true);
  });

  it('ends when the last subscriber leaves', () => {
    const follower = createWireFollower(new AbortController().signal);
    const stop = follower.onChange(() => {});
    expect(follower.live.signal.aborted).toBe(false);
    stop();
    expect(follower.live.signal.aborted).toBe(true);
  });

  it('ends when the response was handed over and nobody took it up', async () => {
    const follower = createWireFollower(new AbortController().signal);
    follower.handedOver();
    await tick();
    expect(follower.live.signal.aborted).toBe(true);
  });

  it('stays while somebody follows', async () => {
    const follower = createWireFollower(new AbortController().signal);
    follower.handedOver();
    follower.onChange(() => {});
    await tick();
    expect(follower.live.signal.aborted).toBe(false);
  });
});

describe('a shell following a read', () => {
  it('a later answer lands in the action and reaches the terminal as a new frame', async () => {
    const roster = {
      id: 'roster',
      data: { rows: [] },
      layout: { component: 'List', props: { items: '$.rows' } },
      endpoints: { load: { url: '/api/vex', method: 'POST', target: 'rows' } },
      lifecycle: { mount: [{ call: 'load' }] },
    };
    const app = {
      charter: { public: ['roster'] },
      assignments: {},
      actions: { roster },
      shell: { canvases: [{ id: 'main', initial: 'roster' }] },
    } as unknown as NiscApp;

    // The wire a moss server hands its shells, standing in for the real one:
    // a vex read that answers, then keeps answering.
    const followers: ReturnType<typeof createWireFollower>[] = [];
    const wire = (): FetchFn => async (_url, init) => {
      const follower = createWireFollower(init?.signal ?? new AbortController().signal);
      followers.push(follower);
      follower.handedOver();
      return { ok: true, status: 200, json: async () => ['Ada'], text: async () => '["Ada"]', onChange: follower.onChange };
    };
    const ctx: ShellHostContext = {
      app,
      catalogFor: () => ({ ids: ['roster'], hash: 'h' }),
      variantsFor: () => new Map(),
      resolve: async () => ({ roles: ['public'], scope: {}, installed: undefined, catalog: { ids: ['roster'], hash: 'h' }, variants: new Map(), policy: { default: 'deny', entities: {} } }),
      wire,
      runtime: {} as ShellHostContext['runtime'],
    };
    const sent: string[] = [];
    const connection: Connection = { send: (text) => void sent.push(text), close: () => {}, onMessage: () => {}, onClose: () => {} };

    const session = await createShellHost(ctx).session('t', 'usr_1');
    await tick();
    session.attach(connection);
    await tick();
    expect(sent.join('\n')).toContain('Ada');
    expect(sent.join('\n')).not.toContain('Ben');

    followers[0]?.live.onChange(answer(['Ada', 'Ben']));
    await tick();
    await tick();
    expect(sent.at(-1)).toContain('Ben');

    // Unmounting the action ends the follow.
    session.shell.clear('main');
    expect(followers[0]?.live.signal.aborted).toBe(true);
  });
});
