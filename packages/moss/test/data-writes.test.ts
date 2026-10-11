import { describe, it, expect, vi } from 'vitest';
import type { WriteEvent } from '@niscorp/vex';
import { createWriteLane } from '../src/data/writes';
import type { WriteRequest } from '../src/data/writes';

// THE WRITE LANE: what vex reports of a write, handed to whoever subscribed,
// with what the request that wrote said in its headers. The lane knows no
// header by name: whoever hears a write asks for the ones that are its own.

const saying = (headers: Record<string, string>): WriteRequest => ({ header: (name) => headers[name] });

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

  it('a write made inside no request is told with a request that said nothing', () => {
    const lane = createWriteLane();
    const said: (string | undefined)[] = [];
    lane.subscribe((_write, request) => said.push(request.header('x-said')));
    lane.report(event('notes/add'));
    expect(said).toEqual([undefined]);
  });

  it('a write made inside a request is told with what that request said, across what the request awaits', async () => {
    const lane = createWriteLane();
    const said: (string | undefined)[] = [];
    lane.subscribe((_write, request) => said.push(request.header('x-said')));
    await lane.within(saying({ 'x-said': 'this' }), async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      lane.report(event('notes/add'));
    });
    lane.report(event('notes/edit'));
    expect(said).toEqual(['this', undefined]);
  });

  it('two requests at once are each told with their own', async () => {
    const lane = createWriteLane();
    const said: Record<string, string | undefined> = {};
    lane.subscribe((write, request) => {
      said[write.fingerprint] = request.header('x-said');
    });
    const request = (name: string, waits: number) =>
      lane.within(saying({ 'x-said': name }), async () => {
        await new Promise((resolve) => setTimeout(resolve, waits));
        lane.report(event(name));
      });
    await Promise.all([request('slow', 10), request('fast', 0)]);
    expect(said).toEqual({ slow: 'slow', fast: 'fast' });
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
  // and a throw in the first kept the second from running. The lane kept that
  // for a while: the fact lane throwing (an app's `facts.identity`) meant no
  // reaction heard of that write. Each subscriber's failure is its own now:
  // it is logged here, the others are told, and nothing reaches the reporter.
  it('a subscriber that throws is logged, and the others are still told of that write', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const lane = createWriteLane();
    const heard: string[] = [];
    lane.subscribe((write) => heard.push(`before:${write.fingerprint}`));
    lane.subscribe(() => {
      throw new Error('the fact lane failed');
    });
    lane.subscribe((write) => heard.push(`after:${write.fingerprint}`));
    expect(() => lane.report(event('notes/add'))).not.toThrow();
    expect(heard).toEqual(['before:notes/add', 'after:notes/add']);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0]?.some((part) => part instanceof Error && part.message === 'the fact lane failed')).toBe(true);
    // and the next write is told to all three again
    lane.report(event('notes/edit'));
    expect(heard).toEqual(['before:notes/add', 'after:notes/add', 'before:notes/edit', 'after:notes/edit']);
    logged.mockRestore();
  });
});
