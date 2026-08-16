import { describe, expect, it } from 'vitest';
import { createDataStore, createEventBus, createMessageBus } from '@shared';
import { attachTriggers } from '@action/runtime/triggers';
import type { StepContext } from '@action/runtime/steps';
import type { TriggerConfig } from '@action/schemas';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

// Typed FROM StepContext, not from the factories. This helper builds a step
// context, so its parts are that context's parts — inferring them from
// `ReturnType<typeof createEventBus>` instead described a bus the runtime does
// not take, and the mismatch was invisible while tests went untypechecked.
const makeBuild = (
  dataStore: StepContext['dataStore'],
  eventBus: StepContext['eventBus'],
  messageBus: StepContext['messageBus'],
): (() => StepContext) => () => ({
  dataStore,
  endpoints: {},
  functions: {},
  eventBus,
  messageBus,
  extras: {},
  strict: false,
  onError: () => {},
  signal: new AbortController().signal,
});

describe('attachTriggers', () => {
  it('fires on matching ui event with matching ref', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ n: 0 });
    const triggers: TriggerConfig[] = [
      { event: 'ui:click', ref: 'btn', do: [{ increment: 'n' }] },
    ];
    attachTriggers(triggers, eventBus, messageBus, makeBuild(dataStore, eventBus, messageBus), 'inst');
    eventBus.emit({ type: 'ui:click', ref: 'btn' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 1 });
  });

  it('exposes an announced payload to steps as @event.payload', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ chosen: [] });
    attachTriggers(
      [{ message: 'chosen', do: [{ set: 'chosen', value: '@event.payload' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    // `emit` takes a payload and the bus delivers one; a listener reads it the
    // same way it reads a click's. Without this, an overlay handing its result
    // back to the screen underneath could only ever say "something happened".
    messageBus.publish('chosen', ['a', 'b']);
    await tick();
    expect(dataStore.get()).toEqual({ chosen: ['a', 'b'] });
  });

  it('fires a message trigger that reads no payload', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ n: 0 });
    attachTriggers(
      [{ message: 'ping', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    messageBus.publish('ping');
    await tick();
    expect(dataStore.get()).toEqual({ n: 1 });
  });

  it('exposes the firing event to steps as @event (e.g. a clicked list index)', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ items: ['a', 'b', 'c'] });
    attachTriggers(
      [{ event: 'ui:click', ref: 'remove', do: [{ removeAt: 'items', index: '{{@event.payload}}' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    eventBus.emit({ type: 'ui:click', ref: 'remove', payload: 1 });
    await tick();
    expect(dataStore.get()).toEqual({ items: ['a', 'c'] });
  });

  it('ignores ui event when ref does not match', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ n: 0 });
    attachTriggers(
      [{ event: 'ui:click', ref: 'btn', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    eventBus.emit({ type: 'ui:click', ref: 'other' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 0 });
  });

  it('fires on ui:key only for the matching key', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ n: 0 });
    attachTriggers(
      [{ event: 'ui:key', key: 'ArrowDown', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    eventBus.emit({ type: 'ui:key', key: 'ArrowUp' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 0 }); // non-matching key ignored
    eventBus.emit({ type: 'ui:key', key: 'ArrowDown' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 1 }); // matching key fires
  });

  it('fires multiple matching triggers in order', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ log: [] as string[] });
    attachTriggers(
      [
        { event: 'ui:submit', do: [{ push: 'log', value: 'a' }] },
        { event: 'ui:submit', do: [{ push: 'log', value: 'b' }] },
      ],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    eventBus.emit({ type: 'ui:submit' });
    await tick();
    await tick();
    expect(dataStore.get()).toEqual({ log: ['a', 'b'] });
  });

  it('handles message triggers via messageBus', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ n: 0 });
    attachTriggers(
      [{ message: 'cart-updated', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    messageBus.publish('cart-updated');
    await tick();
    expect(dataStore.get()).toEqual({ n: 1 });
  });

  it('detach unsubscribes', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<Record<string, unknown>>({ n: 0 });
    const handle = attachTriggers(
      [{ event: 'ui:click', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
      'inst',
    );
    handle.detach();
    eventBus.emit({ type: 'ui:click' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 0 });
  });
});
