import type { EventBus } from '@shared/event-bus';
import { hasKey } from '@shared/common';
import { ErrorCodes, NovaError } from '@shared/errors';
import type { MessageBus } from '@shared/message-bus';
import type { Unsubscribe } from '@shared/common';
import type { TriggerConfig } from '../schemas';
import { executeSteps, type StepContext } from './steps';

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

const toNovaError = (err: unknown): NovaError => {
  if (err instanceof NovaError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new NovaError(ErrorCodes.lifecycle, message, {}, { cause: err });
};

const fireTrigger = (
  trigger: TriggerConfig,
  buildContext: () => StepContext,
  event?: unknown,
): void => {
  const base = buildContext();
  if (base.signal.aborted) return;
  // Expose the firing event to the trigger's steps as `@event`, mirroring
  // how `@error` is injected on failed calls — so a step can reference
  // `{{@event.payload}}` (e.g. the clicked list index).
  const ctx: StepContext =
    event === undefined ? base : { ...base, extras: { ...base.extras, '@event': event } };
  void executeSteps(trigger.do, ctx).catch((err: unknown) => {
    ctx.onError(toNovaError(err));
  });
};

export const attachTriggers = (
  triggers: TriggerConfig[],
  eventBus: EventBus,
  messageBus: MessageBus,
  buildContext: () => StepContext,
): TriggerHandle => {
  const unsubscribes: Unsubscribe[] = [];

  for (const trigger of triggers) {
    if (trigger.event !== undefined) {
      const expectedRef = trigger.ref;
      const triggerType: string = trigger.event;
      const off = eventBus.on(triggerType, (event) => {
        if (expectedRef !== undefined && eventRef(event) !== expectedRef) return;
        fireTrigger(trigger, buildContext, event);
      });
      unsubscribes.push(off);
      continue;
    }
    if (trigger.message !== undefined) {
      const off = messageBus.subscribe(trigger.message, () => {
        fireTrigger(trigger, buildContext);
      });
      unsubscribes.push(off);
    }
  }

  const detach = (): void => {
    for (const off of unsubscribes) off();
  };

  return { detach };
};
