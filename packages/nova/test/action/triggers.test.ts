import { describe, expect, it } from 'vitest';
import { createDataStore, createEventBus, createMessageBus } from '@shared';
import { attachTriggers } from '@action/runtime/triggers';
import type { StepContext } from '@action/runtime/steps';
import type { TriggerConfig } from '@action/schemas';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

const makeBuild = (
  dataStore: ReturnType<typeof createDataStore>,
  eventBus: ReturnType<typeof createEventBus>,
  messageBus: ReturnType<typeof createMessageBus>,
): (() => StepContext) => () => ({
  dataStore,
  endpoints: {},
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
    const dataStore = createDataStore({ n: 0 });
    const triggers: TriggerConfig[] = [
      { event: 'ui:click', ref: 'btn', do: [{ increment: 'n' }] },
    ];
    attachTriggers(triggers, eventBus, messageBus, makeBuild(dataStore, eventBus, messageBus));
    eventBus.emit({ type: 'ui:click', ref: 'btn' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 1 });
  });

  it('ignores ui event when ref does not match', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore({ n: 0 });
    attachTriggers(
      [{ event: 'ui:click', ref: 'btn', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
    );
    eventBus.emit({ type: 'ui:click', ref: 'other' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 0 });
  });

  it('fires multiple matching triggers in order', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore<{ log: string[] }>({ log: [] });
    attachTriggers(
      [
        { event: 'ui:submit', do: [{ push: 'log', value: 'a' }] },
        { event: 'ui:submit', do: [{ push: 'log', value: 'b' }] },
      ],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
    );
    eventBus.emit({ type: 'ui:submit' });
    await tick();
    await tick();
    expect(dataStore.get()).toEqual({ log: ['a', 'b'] });
  });

  it('handles message triggers via messageBus', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore({ n: 0 });
    attachTriggers(
      [{ message: 'cart-updated', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
    );
    messageBus.publish('cart-updated');
    await tick();
    expect(dataStore.get()).toEqual({ n: 1 });
  });

  it('detach unsubscribes', async () => {
    const eventBus = createEventBus();
    const messageBus = createMessageBus();
    const dataStore = createDataStore({ n: 0 });
    const handle = attachTriggers(
      [{ event: 'ui:click', do: [{ increment: 'n' }] }],
      eventBus,
      messageBus,
      makeBuild(dataStore, eventBus, messageBus),
    );
    handle.detach();
    eventBus.emit({ type: 'ui:click' });
    await tick();
    expect(dataStore.get()).toEqual({ n: 0 });
  });
});
