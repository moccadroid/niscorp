// ═══════════════════════════════════════════════════════════
// Scratch agent — Phase A reality contact
// ═══════════════════════════════════════════════════════════
//
// A trivial Cortex agent running against a real model via Signal.
// This is the five-minute canary from DESIGN.md §15 "How we know
// we're on the right track" — we keep it around through every phase.
// Every time we change Cortex, we run this. If it breaks or feels
// worse, we know immediately.
//
// Usage:
//   OPENAI_API_KEY=... GROQ_API_KEY=... \
//     pnpm --filter @niscorp/cortex exec tsx examples/scratch.ts
//
// The example does three things:
//   1. Runs a text-mode agent (prose output)
//   2. Runs a structured-mode agent (JSON output, Zod-validated)
//   3. Runs a structured-mode agent with a tool call (calculator)
//
// Each run prints the previewContext (what the model sees) + the
// final result. If any of the three break, Cortex is broken and
// we stop other work until it's green again.

import { z } from 'zod';
import { createSignal } from '@niscorp/signal';
import {
  createManifold,
  defineAgent,
  defineTool,
  runAgentStandalone,
  type SignalClient,
} from '../src/index';
import { mappingAgent, type MappingAgentOutput } from '@niscorp/prism/agent';
import { evaluate } from '@niscorp/prism';

// Default to groq + openai/gpt-oss-120b. Set GROQ_API_KEY before
// running. Override the model with CORTEX_MODEL if you want to test
// against a different one (e.g. llama-3.3-70b-versatile).
const pickProvider = (): 'groq' | never => {
  if (process.env.GROQ_API_KEY) return 'groq';
  console.error('Set GROQ_API_KEY before running the scratch agent (this canary uses groq + openai/gpt-oss-120b by default).');
  return process.exit(1);
};

const provider = pickProvider();
const model = process.env.CORTEX_MODEL ?? 'openai/gpt-oss-120b';

// Create a Signal instance. Its `step` and `count` methods satisfy
// Cortex's SignalClient contract structurally.
const signal = createSignal(provider, { model });
const llm: SignalClient = signal;

// ─── 1. Text-mode canary ───────────────────────────────────

const textAgent = defineAgent({
  id: 'scratch.text',
  name: 'Scratch Text',
  description: 'Rewrites a sentence in a given tone.',
  instructions: 'You rewrite the user sentence in one paragraph using a warm, conversational tone. Return the rewritten sentence only.',
  outputMode: 'text',
});

// ─── 2. Structured-mode canary ─────────────────────────────

const StylesSchema = z.object({
  formal: z.string().describe('A formal, professional version.'),
  casual: z.string().describe('A casual, everyday version.'),
  poetic: z.string().describe('A poetic, evocative version.'),
});

const stylesAgent = defineAgent({
  id: 'scratch.styles',
  name: 'Scratch Styles',
  description: 'Rewrites a sentence in three styles and returns JSON.',
  instructions:
    'You rewrite the user sentence in three different styles: formal, casual, and poetic. ' +
    'Return ONLY a JSON object with keys "formal", "casual", "poetic". No other text, no markdown fences.',
  outputMode: 'structured',
  outputSchema: StylesSchema,
});

// ─── 3. Structured-mode with a tool call ───────────────────

const calculatorTool = defineTool({
  id: 'calculator',
  name: 'calculator',
  description: 'Evaluates a simple arithmetic expression like "2 + 3 * 4". Only numbers and + - * / ( ) are allowed.',
  input: z.object({ expression: z.string() }),
  execute: async ({ expression }) => {
    if (!/^[\d+\-*/().\s]+$/.test(expression)) {
      throw new Error(`invalid characters in expression: ${expression}`);
    }
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${expression})`) as () => number;
    return { result: fn() };
  },
});

const CalcSchema = z.object({
  answer: z.number(),
  working: z.string(),
});

const calcAgent = defineAgent({
  id: 'scratch.calc',
  name: 'Scratch Calc',
  description: 'Uses a calculator tool and returns the numeric answer.',
  instructions:
    'Use the calculator tool to compute the user\'s arithmetic request. ' +
    'Return ONLY a JSON object with keys "answer" (number) and "working" (short explanation). ' +
    'No markdown fences.',
  outputMode: 'structured',
  outputSchema: CalcSchema,
  tools: ['calculator'],
});

// ─── Run the canary ────────────────────────────────────────

const run = async (): Promise<void> => {
  console.log(`\n━━━━ Cortex scratch canary — provider: ${provider} model: ${model} ━━━━\n`);

  // Canary 1: text via standalone helper.
  console.log('[1/5] Text-mode agent (standalone):');
  const r1 = await runAgentStandalone(textAgent, 'The cat sat on the mat.', { llm });
  if (!r1.ok) {
    console.error('  FAILED:', r1.error);
    process.exit(1);
    return;
  }
  console.log('  ->', r1.data);

  // Canary 2: structured via manifold.
  console.log('\n[2/5] Structured-mode agent (manifold):');
  const m = createManifold({ llm });
  m.registerAgent(stylesAgent);
  const preview2 = await m.previewContext(stylesAgent.agentId, 'The cat sat on the mat.');
  console.log(`  previewContext: ${preview2.chunks.length} chunks, ~${preview2.totalTokens} tokens`);
  const r2 = await m.execute<z.infer<typeof StylesSchema>>(
    stylesAgent.agentId,
    'The cat sat on the mat.',
  );
  if (!r2.ok) {
    console.error('  FAILED:', r2.error);
    process.exit(1);
  }
  console.log('  ->', JSON.stringify(r2.data, null, 2));

  // Canary 3: structured + tool call via manifold.
  console.log('\n[3/5] Structured-mode + tool call (manifold):');
  m.registerTool(calculatorTool);
  m.registerAgent(calcAgent);
  const r3 = await m.execute<z.infer<typeof CalcSchema>>(
    calcAgent.agentId,
    'What is (2 + 3) * 7 - 6?',
  );
  if (!r3.ok) {
    console.error('  FAILED:', r3.error);
    process.exit(1);
  }
  console.log('  ->', JSON.stringify(r3.data, null, 2));

  // Canary 4: Prism mapping agent — the real domain agent.
  // ONE call into Cortex. The agent's output schema embeds Prism's
  // ConfigSchema, so result.data is already a fully-typed
  // { config, reasoning? } — no manual reparse needed.
  console.log('\n[4/5] Prism mapping agent — real domain agent in @niscorp/prism/agent:');
  const sampleInput = { first: 'Ada', last: 'Lovelace', born: 1815, country: 'UK' };
  const mapping = await runAgentStandalone<MappingAgentOutput>(
    mappingAgent,
    {
      sampleInput,
      targetShape: { fullName: '', age: 0, location: '' },
      fieldDescriptions: {
        age: 'Years since the person was born, computed from the current year (2026).',
        location: 'The country uppercased.',
      },
    },
    { llm },
  );
  if (!mapping.ok) {
    console.error('  FAILED:', mapping.error);
    process.exit(1);
    return;
  }
  console.log('  config ->', JSON.stringify(mapping.data.config, null, 2));
  console.log('  evaluated against sample ->', JSON.stringify(evaluate(mapping.data.config, sampleInput), null, 2));
  if (mapping.data.reasoning) console.log('  reasoning ->', mapping.data.reasoning);

  // Canary 5: plan-mode agent (Phase B). The director uses tools and
  // finalizes via an ActionPlan tick loop. This is the live test that
  // proves Phase B works against a real model, not just stubs.
  console.log('\n[5/5] Plan-mode agent (Phase B tick loop + tools, manifold):');
  const m2 = createManifold({ llm });
  m2.registerTool(
    defineTool({
      id: 'word_count',
      name: 'word_count',
      description: 'Counts the number of words in the given text.',
      input: z.object({ text: z.string() }),
      execute: async ({ text }) => ({ count: text.trim().split(/\s+/).filter(Boolean).length }),
    }),
  );
  m2.registerAgent(
    defineAgent({
      id: 'analyzer',
      name: 'Analyzer',
      description: 'Plans how to analyze a sentence and finalizes with the count.',
      instructions:
        'You are a planning agent. Use the word_count tool to count the words in the user input, then return a final node whose result is { "wordCount": <number>, "input": <user input> }. Keep the plan small.',
      outputMode: 'plan',
      tools: ['word_count'],
      maxTicks: 6,
    }),
  );
  const r5 = await m2.execute('analyzer', 'The quick brown fox jumps over the lazy dog.');
  if (!r5.ok) {
    console.error('  FAILED:', r5.error);
    process.exit(1);
    return;
  }
  console.log('  ->', JSON.stringify(r5.data, null, 2));

  console.log('\n━━━━ all five canaries green ━━━━\n');
};

run().catch((e) => {
  console.error('scratch canary threw:', e);
  process.exit(1);
});
