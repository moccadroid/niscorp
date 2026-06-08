import { defineRule } from '@niscorp/cortex';

export const queryRules = [
  defineRule({
    id: 'vex.toolLimit',
    description: 'Limits tool iterations to prevent runaway agents',
    watch: {
      toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
    },
    rules: [
      { when: { $gte: ['toolCalls', 8] }, then: { inject: 'You have used many tools. Finalize your query now.' } },
      { when: { $gte: ['toolCalls', 10] }, then: { abort: 'Maximum tool calls exceeded.' } },
    ],
  }),

  defineRule({
    id: 'vex.unsatisfiable',
    description: 'Aborts when the agent signals the request cannot be satisfied',
    watch: {
      reason: { event: 'vex.unsatisfiable', aggregate: 'latest', field: 'reason' },
    },
    rules: [
      { when: { $neq: ['reason', null] }, then: { abort: 'Request cannot be satisfied' } },
    ],
  }),
];
