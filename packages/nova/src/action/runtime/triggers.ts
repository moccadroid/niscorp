import type { EventBus } from '@shared/event-bus';
import { hasKey } from '@shared/common';
import { ErrorCodes, NovaError } from '@shared/errors';
import type { MessageBus } from '@shared/message-bus';
import type { Unsubscribe } from '@shared/common';
import type { TriggerConfig } from '../schemas';
import { executeSteps, type StepContext } from './steps';
import { asCause, isRunaway, nextCause, rootCause, runawayMessage, type Cause } from './cause';

export type TriggerHandle = {
  detach: () => void;
};

const eventRef = (event: unknown): string | undefined => {
  if (!hasKey(event, 'ref')) return undefined;
  const candidate = event['ref'];
  return typeof candidate === 'string' ? candidate : undefined;
};

const eventKey = (event: unknown): string | undefined => {
  if (!hasKey(event, 'key')) return undefined;
  const candidate = event['key'];
  return typeof candidate === 'string' ? candidate : undefined;
};

const toNovaError = (err: unknown): NovaError => {
  if (err instanceof NovaError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new NovaError(ErrorCodes.lifecycle, message, {}, { cause: err });
};

const fireTrigger = (
  trigger: TriggerConfig,
  buildContext: () => StepContext,
  event: unknown,
  cause: Cause,
): void => {
  const built = buildContext();
  if (built.signal.aborted) return;
  if (built.suspended === true) return;
  if (isRunaway(cause)) {
    const what = trigger.message === undefined ? 'A trigger' : `The trigger on "${trigger.message}"`;
    built.onError(new NovaError(ErrorCodes.runaway, runawayMessage(cause, what), { channel: trigger.message, depth: cause.depth, hops: cause.root.hops }));
    return;
  }
  const base: StepContext = { ...built, cause };
  const ctx: StepContext =
    event === undefined ? base : { ...base, extras: { ...base.extras, '@event': event } };
  const chain = executeSteps(trigger.do, ctx).catch((err: unknown) => {
    ctx.onError(toNovaError(err));
  });
  ctx.onChain?.(chain);
};

const eventOrigin = (event: unknown): string | undefined => {
  if (!hasKey(event, 'origin')) return undefined;
  const candidate = event['origin'];
  return typeof candidate === 'string' ? candidate : undefined;
};

export const attachTriggers = (
  triggers: TriggerConfig[],
  eventBus: EventBus,
  messageBus: MessageBus,
  buildContext: () => StepContext,
  ownInstanceId: string,
): TriggerHandle => {
  const unsubscribes: Unsubscribe[] = [];

  for (const trigger of triggers) {
    if (trigger.event !== undefined) {
      const expectedRef = trigger.ref;
      const expectedKey = trigger.key;
      const triggerType: string = trigger.event;
      const off = eventBus.on(triggerType, (event) => {
        const origin = eventOrigin(event);
        if (origin !== undefined && origin !== ownInstanceId) return;
        if (expectedRef !== undefined && eventRef(event) !== expectedRef) return;
        if (expectedKey !== undefined && eventKey(event) !== expectedKey) return;
        fireTrigger(trigger, buildContext, event, rootCause());
      });
      unsubscribes.push(off);
      continue;
    }
    if (trigger.message !== undefined) {
      // Wrapped as `{ payload }`: a step reads `@event.payload` whether a UI
      // event or a message fired it.
      const off = messageBus.subscribe(trigger.message, (payload: unknown, _from?: string, cause?: unknown) => {
        fireTrigger(trigger, buildContext, { payload }, nextCause(asCause(cause)));
      });
      unsubscribes.push(off);
    }
  }

  const detach = (): void => {
    for (const off of unsubscribes) off();
  };

  return { detach };
};
