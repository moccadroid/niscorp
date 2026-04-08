import { describe, expect, it, vi } from 'vitest';
import { createComponentRegistry, createLayoutStore } from '@layout';
import { createEventBus } from '@shared/event-bus';
import { createMessageBus } from '@shared/message-bus';
import { createShell } from '@shell';

const makeShell = () => {
  const eventBus = createEventBus();
  const messageBus = createMessageBus();
  const shell = createShell({
    canvases: ['main'],
    registry: createComponentRegistry(),
    layoutStore: createLayoutStore(),
    actions: {},
    eventBus,
    messageBus,
  });
  return { shell, eventBus, messageBus };
};

describe('shell.dispatch / shell.publish / shell.getState', () => {
  it('dispatch fires through event bus subscribers', () => {
    const { shell, eventBus } = makeShell();
    const handler = vi.fn();
    eventBus.on('ui:click', handler);
    shell.dispatch({ type: 'ui:click', ref: 'btn' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'ui:click', ref: 'btn' });
  });

  it('publish fires through channel subscribers', () => {
    const { shell, messageBus } = makeShell();
    const handler = vi.fn();
    messageBus.subscribe('greetings', handler);
    shell.publish('greetings', { hello: 'world' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toEqual({ hello: 'world' });
  });

  it('getState returns current canvas snapshot', () => {
    const { shell } = makeShell();
    const state = shell.getState();
    expect(state.canvases['main']).toBeDefined();
    expect(state.canvases['main']?.stack).toEqual([]);
  });
});
