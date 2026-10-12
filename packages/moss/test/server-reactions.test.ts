import { describe, it, expect, vi, afterEach } from 'vitest';
import type { WriteEvent } from '@niscorp/vex';
import type { NiscApp } from '../src/manifest';
import { subscribeReactions } from '../src/server/reactions';

type Reaction = NonNullable<NiscApp['reactions']>[number];
type Told = Parameters<Reaction['run']>[0];

const subscribed = (reactions: readonly Reaction[]) => {
  const listeners: ((event: WriteEvent) => void)[] = [];
  const delivered: unknown[][] = [];
  subscribeReactions({
    app: { reactions },
    onWrite: (listener) => {
      listeners.push((event) => void listener(event, { header: () => undefined }));
      return () => undefined;
    },
    deliver: (...said) => {
      delivered.push(said);
      return true;
    },
  });
  return {
    delivered,
    write: (event: WriteEvent): void => {
      for (const listener of listeners) listener(event);
    },
  };
};
const landed = (table: string, op: 'insert' | 'update' | 'delete', rows: number): WriteEvent => ({
  fingerprint: `${table}/${op}`,
  scope: { userId: 'i_mara' },
  writes: [{ table, op, rows: Array.from({ length: rows }, (_, id) => ({ id })) }],
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the app’s reactions', () => {
  it('one hears a write on the table it named, and is told that it landed: no row', () => {
    const heard: Told[] = [];
    const { write } = subscribed([{ table: 'notes', run: (told) => void heard.push(told) }]);
    write(landed('notes', 'insert', 2));
    write(landed('tags', 'insert', 1));
    expect(heard).toEqual([{ fingerprint: 'notes/insert', table: 'notes', op: 'insert', count: 2, scope: { userId: 'i_mara' } }]);
  });

  it('one that named an operation hears that operation, and no other on its table', () => {
    const heard: string[] = [];
    const { write } = subscribed([
      { table: 'notes', op: 'insert', run: (told) => void heard.push(`on insert: ${told.op}`) },
      { table: 'notes', run: (told) => void heard.push(`on any: ${told.op}`) },
    ]);
    write(landed('notes', 'update', 1));
    write(landed('notes', 'insert', 1));
    expect(heard).toEqual(['on any: update', 'on insert: insert', 'on any: insert']);
  });

  it('a statement that wrote no row fires nothing', () => {
    const heard: Told[] = [];
    const { write } = subscribed([{ table: 'notes', run: (told) => void heard.push(told) }]);
    write(landed('notes', 'update', 0));
    expect(heard).toEqual([]);
  });

  it('is handed `deliver`, to tell somebody’s screens', () => {
    const { write, delivered } = subscribed([{ table: 'notes', run: (told, { deliver }) => void deliver(String(told.scope['userId']), 'notes-changed', { count: told.count }) }]);
    write(landed('notes', 'insert', 3));
    expect(delivered).toEqual([['i_mara', 'notes-changed', { count: 3 }]]);
  });

  it('one that throws is logged, and neither the write nor the next reaction is its to stop', () => {
    const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const heard: string[] = [];
    const { write } = subscribed([
      {
        table: 'notes',
        run: () => {
          throw new Error('the app’s own reaction failed');
        },
      },
      { table: 'notes', run: () => void heard.push('the next one') },
    ]);
    expect(() => write(landed('notes', 'insert', 1))).not.toThrow();
    expect(heard).toEqual(['the next one']);
    expect(said).toHaveBeenCalledWith('[moss:reactions]', expect.objectContaining({ message: 'the app’s own reaction failed' }));
  });

  it('an app that declares none subscribes to nothing', () => {
    const subscriptions: unknown[] = [];
    subscribeReactions({ app: {}, onWrite: (listener) => (subscriptions.push(listener), () => undefined), deliver: () => false });
    expect(subscriptions).toEqual([]);
  });
});
