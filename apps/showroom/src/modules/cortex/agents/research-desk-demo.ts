// ═══════════════════════════════════════════════════════════
// Research desk demo — director + 3 specialists + rules
// ═══════════════════════════════════════════════════════════
//
// A plan-mode director coordinates three specialists:
//   - Researcher (text mode + search tool) — finds facts
//   - Analyst (structured mode) — produces { claim, confidence }
//   - Writer (text mode) — writes a polished summary
//
// A budget rule watches total observations and warns/aborts
// if the workflow takes too long.

import { z } from 'zod';
import { defineAgent, defineTool, defineRule } from '@niscorp/cortex';

// ─── Tool: research search ───────────────────────────────

export const researchSearchTool = defineTool({
  id: 'desk.search',
  name: 'search',
  description: 'Searches for facts about a topic. Returns a snippet.',
  riskLevel: 'low',
  input: z.object({
    query: z.string().describe('The search query.'),
  }),
  execute: async ({ query }) => {
    const db: Record<string, string> = {
      ai: 'AI investment reached $200B globally in 2025, with foundation model training costs doubling annually.',
      regulation: 'The EU AI Act classifies AI systems by risk tier. High-risk systems require conformity assessments.',
      jobs: 'Studies show AI augments 60% of knowledge work tasks but fully automates less than 5% of occupations.',
      safety: 'Leading AI labs committed to pre-deployment safety testing under the Seoul AI Safety Compact.',
      open: 'Open-source AI models now match proprietary systems on many benchmarks, driving enterprise adoption.',
    };
    const key = Object.keys(db).find((k) => query.toLowerCase().includes(k));
    return { snippet: key ? db[key] : `General finding about "${query}": significant ongoing developments.` };
  },
});

// ─── Specialist 1: Researcher (text mode + tool) ─────────

export const researcherAgent = defineAgent({
  id: 'desk.researcher',
  name: 'Researcher',
  description: 'Searches for facts and returns raw findings.',
  instructions:
    'You are a research specialist. Use the search tool to find 2-3 facts about the given topic. ' +
    'Return your raw findings as a brief list. No analysis, just facts.',
  outputMode: 'text',
  tools: ['desk.search'],
});

// ─── Specialist 2: Analyst (structured mode) ─────────────

const AnalysisSchema = z.object({
  claim: z.string().describe('The main claim derived from the research.'),
  confidence: z.number().min(0).max(1).describe('Confidence in the claim, 0-1.'),
  keyPoints: z.array(z.string()).describe('Key supporting points from the research.'),
});

export const analystAgent = defineAgent({
  id: 'desk.analyst',
  name: 'Analyst',
  description: 'Analyzes research findings and produces a structured assessment.',
  instructions:
    'You are an analyst. You will receive research findings as input. ' +
    'Analyze them and return a structured assessment with a main claim, confidence score, and key points. ' +
    'Be objective. Confidence should reflect the strength of evidence.',
  outputMode: 'structured',
  outputSchema: AnalysisSchema,
});

// ─── Specialist 3: Writer (text mode) ────────────────────

export const writerAgent = defineAgent({
  id: 'desk.writer',
  name: 'Writer',
  description: 'Writes a polished summary from an analysis.',
  instructions:
    'You are a writer. You will receive an analysis as input (claim, confidence, key points). ' +
    'Write a polished 2-3 sentence executive summary. Be clear and concise. ' +
    'Mention the confidence level naturally (e.g. "with high confidence" or "tentatively").',
  outputMode: 'text',
});

// ─── Director (plan mode) ────────────────────────────────

export const directorAgent = defineAgent({
  id: 'desk.director',
  name: 'Research Director',
  description: 'Coordinates researcher, analyst, and writer to produce a research brief.',
  instructions:
    'You are a research director coordinating three specialists. Given a topic:\n' +
    '1. First tick: delegate to desk.researcher with the user\'s topic as input.\n' +
    '2. Second tick: after seeing the researcher\'s findings, delegate to desk.analyst with those findings as input.\n' +
    '3. Third tick: after seeing the analysis, delegate to desk.writer with the analysis as input.\n' +
    '4. Fourth tick: after seeing the written summary, return a final node whose result is the writer\'s output.\n' +
    'Each tick: return a JSON array with one ask_agent node. No prose, no markdown fences.\n' +
    'If you see a budget warning, skip remaining steps and finalize with what you have.',
  outputMode: 'plan',
  maxTicks: 6,
});

// ─── Rule: budget guardian for the whole workflow ─────────

export const deskBudgetRule = defineRule({
  id: 'desk-budget',
  description: 'Warns at 5 observations, aborts at 8 — keeps the multi-agent workflow bounded.',
  watch: {
    totalObs: { event: 'cortex.observation.recorded', aggregate: 'count' },
  },
  rules: [
    {
      when: { $gte: ['$watch.totalObs', 8] },
      then: { abort: 'Research desk budget exceeded. Too many observations.' },
    },
    {
      when: { $gte: ['$watch.totalObs', 5] },
      then: { inject: '💰 BUDGET: The workflow has used 5+ observations. Finalize with what you have — skip remaining specialists if needed.' },
    },
  ],
});
