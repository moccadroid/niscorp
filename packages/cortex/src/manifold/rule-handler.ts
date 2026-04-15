// ═══════════════════════════════════════════════════════════
// Rule handler — evaluate rules after observations
// ═══════════════════════════════════════════════════════════
//
// Evaluates rules after each observation. Deferred to a microtask
// so accumulators have processed the event first. The trigger
// event's workflowId scopes all effects to the correct workflow.

import type { Bus } from '../types';
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

      bus.emit({
        topic: CortexTopics.ruleEvaluated,
        payload: { result, accumulators: snapshot },
        meta: { timestamp: Date.now(), correlationId: triggerWorkflowId ?? 'rule', workflowId: triggerWorkflowId },
      });

      if (!result.matched) return;
      const effect = result.effect;

      bus.emit({
        topic: CortexTopics.ruleFired,
        payload: { ruleId: result.ruleId, effect, accumulators: snapshot },
        meta: { timestamp: Date.now(), correlationId: triggerWorkflowId ?? 'rule', workflowId: triggerWorkflowId },
      });

      const wf = triggerWorkflowId ? workflows.get(triggerWorkflowId) : undefined;

      if (isInjectEffect(effect)) {
        if (wf) wf.addInjection(effect.inject);
      }
      if (isAbortEffect(effect)) {
        if (wf) wf.abort.abort(effect.abort);
      }
      if (isDenyEffect(effect)) {
        if (wf) {
          wf.updatePolicy((p) => ({
            ...p,
            tools: {
              ...p.tools,
              deny: [...(p.tools?.deny ?? []), '*'],
            },
          }));
        }
      }
    });
  });
};
