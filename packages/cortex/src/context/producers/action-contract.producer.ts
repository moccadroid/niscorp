// ═══════════════════════════════════════════════════════════
// actionContractProducer — explains the ActionPlan to the model
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5.5: pinned (priority 100) for plan-mode agents.
// This producer generates the prompt-side description of the
// ActionPlan schema so the model knows what JSON shape to produce.
//
// We hand-author the description rather than auto-generating from
// the Zod schema. The auto-generated form is too verbose and the
// hand form lets us emphasize the rules that matter (no nested
// parallel, must end in final, etc.).

import type { ContextProducer } from '../types';

const ACTION_CONTRACT = `## Action Contract

You are a planning agent. Respond with a JSON ActionPlan — an array of action nodes — and nothing else. No prose, no code fences.

Allowed action kinds:

- { "kind": "use_tool", "toolId": "<id>", "input": <args>, "as": "<name>" }
  Invoke a registered tool. Args must match the tool's input schema. Optional "as" stores the result under that name in observations.

- { "kind": "ask_agent", "agentId": "<id>", "input": <payload>, "as": "<name>" }
  Delegate to another agent (synchronously) and use their response.

- { "kind": "tell_topic", "topic": "<topic>", "payload": <data> }
  Publish an event. Fire and forget; no response expected.

- { "kind": "wait", "topic": "<topic>", "timeoutMs": <number> }
  Block until an event matching topic fires, or until timeoutMs elapses.

- { "kind": "parallel", "branches": [<node>, <node>, ...] }
  Execute branches concurrently. Branches must NOT contain nested parallel.

- { "kind": "reflect", "content": "<note>" }
  Write a reasoning note to scratch. Visible in observations next tick.

- { "kind": "final", "result": <data> }
  Terminate the workflow and return result. Every plan must eventually contain a final node.

Rules:
- Output an array of nodes. Each node is one of the kinds above.
- A plan is one tick. To do more work after observing tool/agent results, return a plan that does NOT include final, and you will be invoked again with the new observations.
- To finish, include a final node as the last item.
- Keep plans small. Prefer one or two actions per tick over giant plans.
- Use "as" names to track results across nodes.`;

export const actionContractProducer = (): ContextProducer => ({
  id: 'cortex.action-contract',
  priority: 100,
  build: () => [
    {
      role: 'system',
      content: ACTION_CONTRACT,
      source: 'cortex.action-contract',
      tags: ['plan', 'contract'],
    },
  ],
});
