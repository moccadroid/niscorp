// ═══════════════════════════════════════════════════════════
// Plan-mode demo stories
// ═══════════════════════════════════════════════════════════

import type { CortexStory } from '../story-types';
import {
  greeterPlanner,
  analyzerPlanner,
  directorPlanner,
  summarizerAgent,
  classifierAgent,
  wordCountTool,
} from '../agents/plan-mode';

// ─── Demo 1: single-tick finalize ──────────────────────────

const greetSingleTick: CortexStory = {
  id: 'plan-mode.greeter',
  name: 'Single-tick greeter',
  description:
    'The smallest possible plan-mode demo. The agent returns a one-element plan with just a `final` node. Shows the ActionPlan contract at minimum, no tools, no delegation, one tick.',
  category: 'Single-tick finalize',
  kind: 'plan-mode',
  demo: 'plan-mode',
  agent: greeterPlanner,
  prompt: 'Say hello to me.',
};

// ─── Demo 2: multi-tick with a tool ────────────────────────

const analyzeMultiTick: CortexStory = {
  id: 'plan-mode.analyzer',
  name: 'Analyzer (multi-tick + tool)',
  description:
    'A plan-mode agent that takes more than one tick to finish. Tick 1 returns a plan with a use_tool node calling word_count. Tick 2, after seeing the observation, returns a plan with a final node containing the result. Shows the tick loop driving the agent across iterations.',
  category: 'Multi-tick with tool',
  kind: 'plan-mode',
  demo: 'plan-mode',
  agent: analyzerPlanner,
  tools: [wordCountTool],
  prompt: 'Count the words in: "The quick brown fox jumps over the lazy dog."',
};

// ─── Demo 3: director + specialists ────────────────────────

const directorWithSpecialists: CortexStory = {
  id: 'plan-mode.director',
  name: 'Director (delegation, parallel ask_agent)',
  description:
    'A plan-mode director that delegates to two specialist agents in parallel via ask_agent. The summarizer (text mode) and classifier (structured mode) run concurrently inside a parallel branch. Once both observations are in, the director returns a final result combining both.',
  category: 'ask_agent delegation',
  kind: 'plan-mode',
  demo: 'plan-mode',
  agent: directorPlanner,
  specialists: [summarizerAgent, classifierAgent],
  prompt:
    'In 2026, advances in autonomous agent runtimes have made it practical for one LLM call to coordinate multiple specialists in parallel. This article explores how a director agent uses Cortex to delegate work without orchestration boilerplate.',
};

export const planModeStories: readonly CortexStory[] = [
  greetSingleTick,
  analyzeMultiTick,
  directorWithSpecialists,
];
