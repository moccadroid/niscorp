import type { EventBus } from '@shared/event-bus';
import { hasKey } from '@shared/common';
import { ErrorCodes, NovaError } from '@shared/errors';
import type { MessageBus } from '@shared/message-bus';
import type { Unsubscribe } from '@shared/common';
import type { TriggerConfig } from '../schemas';
import { executeSteps, type StepContext } from './steps';
import { asCause, isRunaway, nextCause, rootCause, runawayMessage, type Cause } from './cause';

// ═══════════════════════════════════════════════════════════
// Trigger subscriptions for an action.
//
// Event triggers subscribe to the event bus on the declared `type`
// (e.g. "ui:click"). If a `ref` is set, only events whose `ref` field
// matches fire.
//
// Message triggers subscribe to the message bus by channel — no
// `msg:` prefixing, no bridging through the event bus.
//
// Trigger step failures flow to the context's onError hook instead of
// being silently dropped. If the runtime has been aborted (e.g. mid-
// unmount), late-arriving events are dropped.
// ═══════════════════════════════════════════════════════════

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
  // A suspended action (backgrounded under a stack) reacts to nothing — only the
  // active top of a canvas handles events/messages.
  if (built.suspended === true) return;
  // A chain past its budget stops here, and says so (./cause.ts).
  if (isRunaway(cause)) {
    const what = trigger.message === undefined ? 'A trigger' : `The trigger on "${trigger.message}"`;
    built.onError(new NovaError(ErrorCodes.runaway, runawayMessage(cause, what), { channel: trigger.message, depth: cause.depth, hops: cause.root.hops }));
    return;
  }
  const base: StepContext = { ...built, cause };
  // Expose the firing event to the trigger's steps as `@event`, mirroring
  // how `@error` is injected on failed calls — so a step can reference
  // `{{@event.payload}}` (e.g. the clicked list index).
  const ctx: StepContext =
    event === undefined ? base : { ...base, extras: { ...base.extras, '@event': event } };
  void executeSteps(trigger.do, ctx).catch((err: unknown) => {
    ctx.onError(toNovaError(err));
  });
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
        // A UI event stamped with an origin is delivered to that instance only;
        // events with no origin (programmatic `shell.dispatch`) stay global.
        const origin = eventOrigin(event);
        if (origin !== undefined && origin !== ownInstanceId) return;
        if (expectedRef !== undefined && eventRef(event) !== expectedRef) return;
        if (expectedKey !== undefined && eventKey(event) !== expectedKey) return;
        // A gesture starts a chain.
        fireTrigger(trigger, buildContext, event, rootCause());
      });
      unsubscribes.push(off);
      continue;
    }
    if (trigger.message !== undefined) {
      // A MESSAGE CARRIES ITS PAYLOAD THE SAME WAY A UI EVENT DOES. `emit`
      // takes one, steps resolve it, and the bus delivers it — so dropping it
      // here made `{ emit: { channel, payload } }` a declaration with no
      // reader, and an announcement that could only ever say "something
      // happened". Wrapped as `{ payload }` so a listener writes
      // `@event.payload` whether it was woken by a click or by an
      // announcement; `@event` is the firing thing in both cases.
      // One hop on from whatever emitted it; a host's publish carries no
      // cause and starts a chain of its own.
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
