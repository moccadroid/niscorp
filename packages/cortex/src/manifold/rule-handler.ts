// ═══════════════════════════════════════════════════════════
// Rule handler — evaluate rules after observations
// ═══════════════════════════════════════════════════════════
//
// Evaluates rules after each observation. Deferred to a microtask
// so accumulators have processed the event first. The trigger
// event's workflowId scopes all effects to the correct workflow.

import type { Bus } from '../types';
import type { TypedTopic } from '../utils/typed-topic';
import type { RulesEngine } from '../rules';
import type { WorkflowContext } from './workflow-context';
import { isInjectEffect, isAbortEffect, isDenyEffect } from '../rules';
import { CortexTopics } from '../topics';

export const registerRuleHandler = (
  bus: Bus,
  rulesEngine: RulesEngine,
  workflows: ReadonlyMap<string, WorkflowContext>,
): void => {
  bus.on(CortexTopics.observationRecorded, (triggerEvent) => {
    const triggerWorkflowId = triggerEvent.meta.workflowId;
    void Promise.resolve().then(() => {
      const snapshot = rulesEngine.snapshot();
      const result = rulesEngine.evaluate();

      // If the trigger had a live workflow, use its emit (binds
      // workflowId + correlationId). Otherwise the rule isn't
      // workflow-scoped — fall back to bus.emit with `rule`.
      const wf = triggerWorkflowId ? workflows.get(triggerWorkflowId) : undefined;
      const emitRule = <P>(topic: TypedTopic<P>, payload: P): void => {
        if (wf) wf.emit(topic, payload);
        else bus.emit(topic, payload, { correlationId: 'rule' });
      };

      emitRule(CortexTopics.ruleEvaluated, { result, accumulators: snapshot });

      if (!result.matched) return;
      const effect = result.effect;

      emitRule(CortexTopics.ruleFired, { ruleId: result.ruleId, effect, accumulators: snapshot });

      // Effects only apply to a live workflow.
      if (!wf) return;

      if (isInjectEffect(effect)) wf.addInjection(effect.inject);
      if (isAbortEffect(effect)) wf.abort.abort(effect.abort);
      if (isDenyEffect(effect)) {
        wf.updatePolicy((p) => ({
          ...p,
          tools: {
            ...p.tools,
            deny: [...(p.tools?.deny ?? []), '*'],
          },
        }));
      }
    });
  });
};
