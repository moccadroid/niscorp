import { describe, it, expect } from 'vitest';
import type { WriteEvent } from '@niscorp/vex';
import { createWriteLane } from '../src/data/writes';
import type { ChainHints } from '../src/data/writes';

// THE WRITE LANE: what vex reports of a write, handed to whoever subscribed,
// with the chain position of the request that wrote.

const event = (fingerprint: string): WriteEvent => ({
  fingerprint,
  writes: [{ table: 'notes', op: 'insert', rows: [{ id: 1 }] }],
  scope: { userId: 'usr_1' },
});

describe('the write lane', () => {
  it('tells every subscriber of each write, in the order they subscribed', () => {
    const lane = createWriteLane();
    const heard: string[] = [];
    lane.subscribe((write) => heard.push(`first:${write.fingerprint}`));
    lane.subscribe((write) => heard.push(`second:${write.fingerprint}`));
    lane.report(event('notes/add'));
    lane.report(event('notes/edit'));
    expect(heard).toEqual(['first:notes/add', 'second:notes/add', 'first:notes/edit', 'second:notes/edit']);
  });

  it('hands over what vex reported, as it was reported', () => {
    const lane = createWriteLane();
    const heard: WriteEvent[] = [];
    lane.subscribe((write) => heard.push(write));
    const reported = event('notes/add');
    lane.report(reported);
    expect(heard[0]).toBe(reported);
  });

  it('a write made outside any chain carries no position', () => {
    const lane = createWriteLane();
    const chains: (ChainHints | undefined)[] = [];
    lane.subscribe((_write, chain) => chains.push(chain));
    lane.report(event('notes/add'));
    expect(chains).toEqual([undefined]);
  });

  it('a write made inside a request that named its position carries it, across what the request awaits', async () => {
    const lane = createWriteLane();
    const chains: (ChainHints | undefined)[] = [];
    lane.subscribe((_write, chain) => chains.push(chain));
    await lane.within({ cause: 'f_1', depth: 2 }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lane.report(event('notes/add'));
    });
    lane.report(event('notes/edit'));
    expect(chains).toEqual([{ cause: 'f_1', depth: 2 }, undefined]);
  });

  it('two requests at once each carry their own position', async () => {
    const lane = createWriteLane();
    const chains: Record<string, ChainHints | undefined> = {};
    lane.subscribe((write, chain) => {
      chains[write.fingerprint] = chain;
    });
    const request = (cause: string, waits: number) =>
      lane.within({ cause, depth: 0 }, async () => {
        await new Promise((resolve) => setTimeout(resolve, waits));
        lane.report(event(cause));
      });
    await Promise.all([request('slow', 10), request('fast', 0)]);
    expect(chains).toEqual({ slow: { cause: 'slow', depth: 0 }, fast: { cause: 'fast', depth: 0 } });
  });

  it('a subscriber that stops is told no more', () => {
    const lane = createWriteLane();
    const heard: string[] = [];
    const stop = lane.subscribe((write) => heard.push(write.fingerprint));
    lane.report(event('notes/add'));
    stop();
    lane.report(event('notes/edit'));
    expect(heard).toEqual(['notes/add']);
  });

  // The one observer the lane replaced ran its two jobs one after the other,
  // and a throw in the first kept the second from running. The lane keeps
  // that: the throw goes to whoever reported, which is vex, and vex logs it.
  it('a subscriber that throws ends the telling of that write, and the throw is the reporter\'s', () => {
    const lane = createWriteLane();
    const heard: string[] = [];
    lane.subscribe(() => {
      throw new Error('the first listener failed');
    });
    lane.subscribe((write) => heard.push(write.fingerprint));
    expect(() => lane.report(event('notes/add'))).toThrow('the first listener failed');
    expect(heard).toEqual([]);
  });
});
