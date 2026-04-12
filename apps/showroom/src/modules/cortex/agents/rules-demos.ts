// ═══════════════════════════════════════════════════════════
// Rules engine demo agents + rules
// ═══════════════════════════════════════════════════════════
//
// Phase C showroom demos. These were completely impossible before
// the rules engine. Each demo pairs an agent with one or more
// declarative rules that steer the agent's behavior at runtime.

import { z } from 'zod';
import {
  defineAgent,
  defineTool,
  defineRule,
  type RegisteredRule,
  type ToolDefinition,
  type AgentDefinition,
} from '@niscorp/cortex';

// ───────────────────────────────────────────────────────────
// Demo 1: Tool rate-limiter
//
// An agent that loves calling tools gets reined in by a
// declarative rule. After 3 tool calls the rule injects a
// "wrap it up" warning. After 5 it aborts the run entirely.
// The agent sees the injected warning in its context and
// (usually) wraps up. If it doesn't, the abort fires.
// ───────────────────────────────────────────────────────────

export const researchTool: ToolDefinition = defineTool({
  id: 'demo.search',
  name: 'search',
  description: 'Searches a knowledge base. Returns a short snippet.',
  riskLevel: 'low',
  input: z.object({
    query: z.string().describe('The search query.'),
  }),
  execute: async ({ query }) => {
    // Simulated search results based on keyword matching.
    const db: Record<string, string> = {
      climate: 'Global temperatures have risen by 1.1°C since pre-industrial times.',
      ocean: 'Oceans absorb about 30% of CO2 produced by humans.',
      ice: 'Arctic sea ice has declined by 13% per decade since 1979.',
      forest: 'Tropical forests absorb 2.4 billion tonnes of CO2 annually.',
      energy: 'Renewable energy now accounts for 30% of global electricity.',
      policy: 'The Paris Agreement aims to limit warming to 1.5°C above pre-industrial levels.',
    };
    const key = Object.keys(db).find((k) => query.toLowerCase().includes(k));
    return { snippet: key ? db[key] : `No results for "${query}".` };
  },
});

export const researchAgent: AgentDefinition<unknown> = defineAgent({
  id: 'demo.researcher',
  name: 'Researcher',
  description: 'Searches for facts and compiles a report.',
  instructions:
    'You are a research assistant. Use the search tool to find facts about the user\'s topic, then write a 2-3 sentence report. ' +
    'Search for different aspects — don\'t repeat the same query. ' +
    'If you see a system message warning you to finalize, stop searching and write your report immediately with whatever you have.',
  outputMode: 'text',
  tools: ['demo.search'],
});

export const toolRateLimitRule: RegisteredRule = defineRule({
  id: 'tool-rate-limit',
  description: 'Warns after 3 tool calls, aborts after 5.',
  watch: {
    toolCalls: { event: 'cortex.tool.observed', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.toolCalls', 5] },
      then: { abort: 'Hard limit: 5 tool calls exceeded. Aborting run.' },
    },
    {
      when: { $gte: ['$watch.toolCalls', 3] },
      then: { inject: '⚠ RULE ENGINE: You have made 3+ tool calls. Finalize your report NOW with what you have. Do not make any more tool calls.' },
    },
  ],
});

// ───────────────────────────────────────────────────────────
// Demo 2: Escalation steering
//
// A customer-service agent takes user messages. A separate
// "sentiment analysis" happens on each observation (simulated
// via a tool). When sentiment drops below 0.3, a rule injects
// an escalation warning into the agent's context, visibly
// changing its tone on the next response.
// ───────────────────────────────────────────────────────────

export const sentimentTool: ToolDefinition = defineTool({
  id: 'demo.analyze_sentiment',
  name: 'analyze_sentiment',
  description: 'Analyzes the sentiment of a text. Returns a score from 0 (negative) to 1 (positive).',
  riskLevel: 'low',
  input: z.object({
    text: z.string().describe('The text to analyze.'),
  }),
  execute: async ({ text }) => {
    // Simple keyword-based sentiment for demo purposes.
    const lower = text.toLowerCase();
    const negative = ['angry', 'frustrated', 'terrible', 'awful', 'hate', 'worst', 'unacceptable', 'furious', 'broken', 'useless'];
    const positive = ['great', 'thanks', 'good', 'love', 'excellent', 'happy', 'wonderful', 'perfect'];
    const negCount = negative.filter((w) => lower.includes(w)).length;
    const posCount = positive.filter((w) => lower.includes(w)).length;
    const raw = posCount - negCount;
    const score = Math.max(0, Math.min(1, 0.5 + raw * 0.2));
    return { score, analysis: score < 0.3 ? 'negative' : score > 0.7 ? 'positive' : 'neutral' };
  },
});

export const supportAgent: AgentDefinition<unknown> = defineAgent({
  id: 'demo.support',
  name: 'Support Agent',
  description: 'Handles customer inquiries with empathy.',
  instructions:
    'You are a customer support agent for a software company. ' +
    'First, use the analyze_sentiment tool on the user\'s message to gauge their mood. ' +
    'Then respond helpfully based on their inquiry. ' +
    'If you see a system message about escalation or negative sentiment, immediately switch to a deeply empathetic tone, apologize sincerely, and offer concrete next steps (refund, manager callback, priority ticket). ' +
    'Keep your response under 3 sentences.',
  outputMode: 'text',
  tools: ['demo.analyze_sentiment'],
});

export const escalationRule: RegisteredRule = defineRule({
  id: 'sentiment-escalation',
  description: 'Injects an escalation warning when sentiment drops below 0.3.',
  watch: {
    lastSentiment: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.score' },
  },
  rules: [
    {
      when: { $lt: ['$watch.lastSentiment', 0.3] },
      then: { inject: '🚨 ESCALATION ALERT: Customer sentiment is critically negative. Switch to maximum empathy mode. Apologize sincerely, offer a concrete resolution (refund/callback/priority ticket). Do NOT be defensive.' },
    },
  ],
});

// ───────────────────────────────────────────────────────────
// Demo 3: Budget guardian
//
// A plan-mode agent coordinates specialists. A rule watches
// the cumulative token spend and fires a warning at 50% budget,
// then aborts at 80%. The agent sees the warning in context
// and tries to finalize early.
// ───────────────────────────────────────────────────────────

export const factTool: ToolDefinition = defineTool({
  id: 'demo.lookup_fact',
  name: 'lookup_fact',
  description: 'Looks up a fact about a topic. Returns a one-sentence answer.',
  riskLevel: 'low',
  input: z.object({
    topic: z.string().describe('The topic to look up.'),
  }),
  execute: async ({ topic }) => {
    const facts: Record<string, string> = {
      population: 'The world population reached 8 billion in 2022.',
      gdp: 'Global GDP was approximately $100 trillion in 2022.',
      internet: 'About 5.3 billion people use the internet worldwide.',
      space: 'The International Space Station orbits at about 408 km altitude.',
      default: `Interesting fact about ${topic}: it is a widely studied subject.`,
    };
    const key = Object.keys(facts).find((k) => topic.toLowerCase().includes(k));
    return { fact: facts[key ?? 'default'] };
  },
});

export const factAgent: AgentDefinition<unknown> = defineAgent({
  id: 'demo.fact-finder',
  name: 'Fact Finder',
  description: 'Looks up facts and writes a brief report.',
  instructions:
    'You are a fact-finding agent. Use the lookup_fact tool to research the topic, ' +
    'then compile a brief report. Search for 2-3 different aspects. ' +
    'If you see a budget warning, immediately finalize with what you have.',
  outputMode: 'text',
  tools: ['demo.lookup_fact'],
});

export const budgetGuardianRule: RegisteredRule = defineRule({
  id: 'budget-guardian',
  description: 'Warns at 3 observations, aborts at 5 — simulating a token budget guardian.',
  watch: {
    observations: { event: 'cortex.observation.recorded', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.observations', 5] },
      then: { abort: 'Budget guardian: observation limit exceeded. Forcing early termination.' },
    },
    {
      when: { $gte: ['$watch.observations', 3] },
      then: { inject: '💰 BUDGET WARNING: You have used over half your observation budget. Wrap up your research and finalize your report in the next step. No more tool calls.' },
    },
  ],
});

// ───────────────────────────────────────────────────────────
// Demo 4: Compound condition — multi-signal steering
//
// Shows $and composition: the rule only fires when BOTH
// conditions are true simultaneously. The agent must have
// made 2+ tool calls AND the latest result must contain a
// specific keyword. Demonstrates that rules aren't just
// simple counters — they compose.
// ───────────────────────────────────────────────────────────

export const dbTool: ToolDefinition = defineTool({
  id: 'demo.query_db',
  name: 'query_db',
  description: 'Queries a customer database. Returns a record or null.',
  riskLevel: 'medium',
  input: z.object({
    customerId: z.string().describe('The customer ID to look up.'),
  }),
  execute: async ({ customerId }) => {
    const db: Record<string, { name: string; tier: string; balance: number }> = {
      'C-001': { name: 'Alice Chen', tier: 'enterprise', balance: 52_000 },
      'C-002': { name: 'Bob Martin', tier: 'free', balance: 0 },
      'C-003': { name: 'Carol Voss', tier: 'enterprise', balance: 128_000 },
    };
    return db[customerId] ?? { error: `No customer found for ${customerId}` };
  },
});

export const dbAgent: AgentDefinition<unknown> = defineAgent({
  id: 'demo.db-analyst',
  name: 'DB Analyst',
  description: 'Queries customer records and reports findings.',
  instructions:
    'You are a database analyst. The user will ask about customers. Use the query_db tool to look up customer records by ID. ' +
    'Try looking up C-001, C-002, and C-003. Report your findings. ' +
    'If you see a system message about enterprise access, follow its instructions immediately.',
  outputMode: 'text',
  tools: ['demo.query_db'],
});

export const compoundRule: RegisteredRule = defineRule({
  id: 'enterprise-guard',
  description: 'When 2+ queries AND latest result is enterprise tier, inject a compliance warning.',
  watch: {
    queries: { event: 'cortex.tool.observed', aggregate: 'count' },
    lastTier: { event: 'cortex.observation.recorded', aggregate: 'latest', field: 'result.tier' },
  },
  rules: [
    {
      when: {
        $and: [
          { $gte: ['$watch.queries', 2] },
          { $eq: ['$watch.lastTier', 'enterprise'] },
        ],
      },
      then: { inject: '🔒 COMPLIANCE: Enterprise customer data accessed. You MUST include a compliance disclaimer in your report: "Enterprise data accessed under audit policy §4.2. Do not share externally."' },
    },
  ],
});

// ───────────────────────────────────────────────────────────
// Demo 5: The happy path — no rule fires
//
// Same agent and tool as Demo 1, but the user asks a simple
// question that only needs 1-2 tool calls. The rule exists
// but never triggers because the threshold isn't reached.
// Shows that rules are zero-cost when conditions aren't met.
// ───────────────────────────────────────────────────────────

export const quickResearchAgent: AgentDefinition<unknown> = defineAgent({
  id: 'demo.quick-researcher',
  name: 'Quick Researcher',
  description: 'Answers a simple factual question with a single search.',
  instructions:
    'You are a research assistant. Use the search tool ONCE to find one fact about the user\'s question, then immediately write a 1-2 sentence answer. ' +
    'Do NOT search more than once — one search is enough for a simple question. ' +
    'If you see a system message warning you to finalize, stop searching and write your answer immediately.',
  outputMode: 'text',
  tools: ['demo.search'],
});
