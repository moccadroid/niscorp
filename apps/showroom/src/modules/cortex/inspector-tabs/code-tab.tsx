import type { FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import {
  isPrismMappingStory,
  isStructuredExtractStory,
  isToolUseStory,
  isPlanModeStory,
  isRulesStory,
  type CortexStory,
  type PrismMappingStory,
  type StructuredExtractStory,
  type ToolUseStory,
  type PlanModeStory,
  type RulesStory,
} from '../story-types';

// ═══════════════════════════════════════════════════════════
// Code tab — copy-pasteable TypeScript snippet that recreates
// the demo in a real project. The whole point of the showroom:
// you see it work, then you copy the code, then you ship it.
// ═══════════════════════════════════════════════════════════

const LEGEND =
  'Copy this into your TypeScript project. Install @niscorp/cortex + @niscorp/signal, set GROQ_API_KEY, run.';

type Props = { story: CortexStory };

const j = (value: unknown): string => JSON.stringify(value, null, 2);

// ───────────────────────────────────────────────────────────
// Per-demo snippets
// ───────────────────────────────────────────────────────────

const generatePrismMapping = (story: PrismMappingStory): string => {
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  lines.push(`import { runAgentStandalone } from '@niscorp/cortex';`);
  lines.push(`import { mappingAgent } from '@niscorp/prism/agent';`);
  lines.push(`import { evaluate } from '@niscorp/prism';`);
  lines.push('');
  lines.push(`const signal = createSignal('groq', {`);
  lines.push(`  apiKey: process.env.GROQ_API_KEY,`);
  lines.push(`  model: 'openai/gpt-oss-120b',`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// ONE call into Cortex. The mapping agent's outputSchema embeds`);
  lines.push(`// Prism's ConfigSchema, so result.data.config is fully validated.`);
  lines.push(`const result = await runAgentStandalone(`);
  lines.push(`  mappingAgent,`);
  lines.push(`  {`);
  lines.push(`    sampleInput: ${j(story.sampleInput)},`);
  lines.push(`    targetShape: ${j(story.expected)},`);
  if (story.fieldDescriptions !== undefined) {
    lines.push(`    fieldDescriptions: ${j(story.fieldDescriptions)},`);
  }
  lines.push(`  },`);
  lines.push(`  { llm: signal },`);
  lines.push(`);`);
  lines.push('');
  lines.push(`if (!result.ok) { console.error(result.error); process.exit(1); }`);
  lines.push('');
  lines.push(`const { config, reasoning } = result.data;`);
  lines.push(`const output = evaluate(config, ${j(story.sampleInput)});`);
  lines.push(`console.log(output);`);
  return lines.join('\n');
};

const generateStructuredExtract = (story: StructuredExtractStory): string => {
  const agentId = story.agent.config.id;
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  lines.push(`import { runAgentStandalone, defineAgent } from '@niscorp/cortex';`);
  lines.push(`import { z } from 'zod';`);
  lines.push('');
  lines.push(`// 1. Define the output schema. Each .describe() teaches the model`);
  lines.push(`//    what the field means — Cortex injects the JSON Schema into`);
  lines.push(`//    the agent's prompt automatically. Single source of truth.`);
  lines.push(`const PersonSchema = z.object({`);
  lines.push(`  name: z.string().describe('The full name of the person.'),`);
  lines.push(`  age: z.number().int().nullable().describe('Age in years, or null if not stated.'),`);
  lines.push(`  occupation: z.string().nullable().describe('Job title, or null.'),`);
  lines.push(`  location: z.string().nullable().describe('Location, or null.'),`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// 2. Define the agent. defineAgent + outputSchema = a typed extractor.`);
  lines.push(`const personExtractor = defineAgent({`);
  lines.push(`  id: '${agentId}',`);
  lines.push(`  name: 'Person Extractor',`);
  lines.push(`  description: 'Extracts a Person from free-form text.',`);
  lines.push(`  instructions: 'Extract the person described. Null for missing fields.',`);
  lines.push(`  outputMode: 'structured',`);
  lines.push(`  outputSchema: PersonSchema,`);
  lines.push(`});`);
  lines.push('');
  lines.push(`const signal = createSignal('groq', {`);
  lines.push(`  apiKey: process.env.GROQ_API_KEY,`);
  lines.push(`  model: 'openai/gpt-oss-120b',`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// 3. ONE call. Cortex parses the JSON, validates against PersonSchema,`);
  lines.push(`//    and (on validation failure) auto-retries with the issue fed back.`);
  lines.push(`const result = await runAgentStandalone(`);
  lines.push(`  personExtractor,`);
  lines.push(`  ${j(story.inputText)},`);
  lines.push(`  { llm: signal },`);
  lines.push(`);`);
  lines.push('');
  lines.push(`if (!result.ok) { console.error(result.error); process.exit(1); }`);
  lines.push('');
  lines.push(`// result.data is fully typed: { name, age, occupation, location }`);
  lines.push(`const person = result.data;`);
  lines.push(`console.log(person);`);
  return lines.join('\n');
};

// Identifier-safe local var name from a dotted id like "demo.weather"
const asIdent = (id: string): string =>
  id.replace(/[^a-zA-Z0-9_$]/g, '_').replace(/^[0-9]/, '_$&');

const generateToolUse = (story: ToolUseStory): string => {
  const firstTool = story.tools[0];
  const toolId = firstTool?.toolId ?? 'demo.tool';
  const toolVar = asIdent(toolId);
  const agentVar = asIdent(story.agent.config.id);
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  lines.push(`import { runAgentStandalone, defineAgent, defineTool } from '@niscorp/cortex';`);
  lines.push(`import { z } from 'zod';`);
  lines.push('');
  lines.push(`// 1. Define the tool. The Zod input schema validates each tool`);
  lines.push(`//    call's args before Cortex invokes execute().`);
  lines.push(`const ${toolVar} = defineTool({`);
  lines.push(`  id: '${toolId}',`);
  lines.push(`  name: '${firstTool?.config.name ?? 'tool'}',`);
  lines.push(`  description: ${JSON.stringify(firstTool?.config.description ?? '')},`);
  lines.push(`  riskLevel: 'low',`);
  lines.push(`  input: z.object({ /* fields */ }),`);
  lines.push(`  execute: async (args) => { /* return result */ },`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// 2. Define the agent. tools whitelist references the tool's id.`);
  lines.push(`const ${agentVar} = defineAgent({`);
  lines.push(`  id: '${story.agent.config.id}',`);
  lines.push(`  name: '${story.agent.config.name}',`);
  lines.push(`  description: ${JSON.stringify(story.agent.config.description)},`);
  lines.push(`  instructions: ${JSON.stringify(story.agent.config.instructions.slice(0, 160) + '...')},`);
  lines.push(`  outputMode: '${story.agent.config.outputMode}',`);
  lines.push(`  tools: ['${toolId}'],`);
  if (story.agent.config.outputMode === 'structured') {
    lines.push(`  outputSchema: /* z.object({...}) */,`);
  }
  lines.push(`});`);
  lines.push('');
  lines.push(`const signal = createSignal('groq', {`);
  lines.push(`  apiKey: process.env.GROQ_API_KEY,`);
  lines.push(`  model: 'openai/gpt-oss-120b',`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// 3. ONE call. Cortex's tool loop drives model→tool→model.`);
  lines.push(`//    Each tool call is gated, validated, and recorded as an`);
  lines.push(`//    observation the agent sees in the next iteration.`);
  lines.push(`const result = await runAgentStandalone(`);
  lines.push(`  ${agentVar},`);
  lines.push(`  ${JSON.stringify(story.prompt)},`);
  lines.push(`  {`);
  lines.push(`    llm: signal,`);
  lines.push(`    tools: [${toolVar}],`);
  if (story.budget) {
    lines.push(`    // Per-run budget cap. Cortex's policy gate enforces this`);
    lines.push(`    // — once tokens are exhausted, further iterations fail.`);
    lines.push(`    manifold: { defaultBudget: ${j(story.budget)} },`);
  }
  lines.push(`    onObservation: (obs) => console.log('observed:', obs),`);
  lines.push(`  },`);
  lines.push(`);`);
  lines.push('');
  lines.push(`if (!result.ok) { console.error(result.error); process.exit(1); }`);
  lines.push(`console.log(result.data);`);
  return lines.join('\n');
};

const generatePlanMode = (story: PlanModeStory): string => {
  const agentVar = asIdent(story.agent.config.id);
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  lines.push(`import { runAgentStandalone, defineAgent } from '@niscorp/cortex';`);
  lines.push('');
  lines.push(`// ─── How plan mode actually works (the layering) ───────────`);
  lines.push(`//`);
  lines.push(`// runAgentStandalone(planAgent, input, { llm }) is ONE call`);
  lines.push(`// that triggers a nested set of loops. Concretely:`);
  lines.push(`//`);
  lines.push(`//   runAgentStandalone(planAgent, input)`);
  lines.push(`//     → manifold.execute()`);
  lines.push(`//       → executeAgent(planAgent)`);
  lines.push(`//         tick loop:                    [outer — only in plan mode]`);
  lines.push(`//           tool loop:                  [inner — every mode]`);
  lines.push(`//             signal.step() → maybe tool calls → execute → loop`);
  lines.push(`//           returns the model's text content`);
  lines.push(`//           parser validates as ActionPlan`);
  lines.push(`//           plan executor walks the plan:`);
  lines.push(`//             use_tool   → execute via registry, observe`);
  lines.push(`//             ask_agent  → recursive executeAgent`);
  lines.push(`//             tell_topic → bus emit`);
  lines.push(`//             wait       → bus.waitFor`);
  lines.push(`//             parallel   → branches concurrently`);
  lines.push(`//             reflect    → write to scratch state`);
  lines.push(`//             final      → DONE — return result`);
  lines.push(`//           if no final: tick again with carried observations`);
  lines.push(`//`);
  lines.push(`// You write one line; Cortex handles all the loops.`);
  lines.push(`// ────────────────────────────────────────────────────────────`);
  lines.push('');
  lines.push(`// Plan-mode agent. outputMode: 'plan' means each call returns`);
  lines.push(`// an ActionPlan — a JSON DSL Cortex's plan executor walks.`);
  lines.push(`const ${agentVar} = defineAgent({`);
  lines.push(`  id: '${story.agent.config.id}',`);
  lines.push(`  name: '${story.agent.config.name}',`);
  lines.push(`  description: ${JSON.stringify(story.agent.config.description)},`);
  lines.push(`  instructions: ${JSON.stringify(story.agent.config.instructions.slice(0, 200) + '...')},`);
  lines.push(`  outputMode: 'plan',`);
  if (story.agent.config.tools && story.agent.config.tools.length > 0) {
    lines.push(`  tools: ${JSON.stringify(story.agent.config.tools)},`);
  }
  lines.push(`});`);
  lines.push('');
  if (story.specialists && story.specialists.length > 0) {
    lines.push(`// Specialists the director can ask_agent into.`);
    for (const s of story.specialists) {
      lines.push(`// - ${s.config.id} (${s.config.outputMode}) — ${s.config.description}`);
    }
    lines.push('');
  }
  lines.push(`const signal = createSignal('groq', {`);
  lines.push(`  apiKey: process.env.GROQ_API_KEY,`);
  lines.push(`  model: 'openai/gpt-oss-120b',`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// Cortex's tick loop runs the agent repeatedly with accumulated`);
  lines.push(`// observations until a final node lands.`);
  lines.push(`const result = await runAgentStandalone(`);
  lines.push(`  ${agentVar},`);
  lines.push(`  ${JSON.stringify(story.prompt)},`);
  lines.push(`  {`);
  lines.push(`    llm: signal,`);
  if (story.tools && story.tools.length > 0) {
    lines.push(`    tools: [/* tool defs */],`);
  }
  if (story.specialists && story.specialists.length > 0) {
    lines.push(`    specialists: [/* specialist agent defs */],`);
  }
  lines.push(`    onObservation: (obs) => console.log('tick', obs.tick, '·', obs.stepKind),`);
  lines.push(`  },`);
  lines.push(`);`);
  lines.push('');
  lines.push(`if (!result.ok) { console.error(result.error); process.exit(1); }`);
  lines.push(`console.log('final result:', result.data);`);
  return lines.join('\n');
};

const generateRules = (story: RulesStory): string => {
  const agentVar = asIdent(story.agent.config.id);
  const lines: string[] = [];
  lines.push(`import { createSignal } from '@niscorp/signal';`);
  lines.push(`import {`);
  lines.push(`  runAgentStandalone,`);
  lines.push(`  defineAgent,`);
  lines.push(`  defineTool,`);
  lines.push(`  defineRule,`);
  lines.push(`} from '@niscorp/cortex';`);
  lines.push(`import { z } from 'zod';`);
  lines.push('');
  lines.push(`// ─── The rule (this is the entire steering logic) ──────────`);
  lines.push('');
  lines.push(`const rule = ${story.ruleCode};`);
  lines.push('');
  if (story.tools && story.tools.length > 0) {
    const firstTool = story.tools[0];
    if (firstTool) {
      lines.push(`// ─── Tool ─────────────────────────────────────────────────`);
      lines.push('');
      lines.push(`const ${asIdent(firstTool.toolId)} = defineTool({`);
      lines.push(`  id: '${firstTool.toolId}',`);
      lines.push(`  name: '${firstTool.config.name}',`);
      lines.push(`  description: ${JSON.stringify(firstTool.config.description)},`);
      lines.push(`  input: z.object({ /* see source */ }),`);
      lines.push(`  execute: async (args) => { /* ... */ },`);
      lines.push(`});`);
      lines.push('');
    }
  }
  lines.push(`// ─── Agent ────────────────────────────────────────────────`);
  lines.push('');
  lines.push(`const ${agentVar} = defineAgent({`);
  lines.push(`  id: '${story.agent.config.id}',`);
  lines.push(`  name: '${story.agent.config.name}',`);
  lines.push(`  description: ${JSON.stringify(story.agent.config.description)},`);
  lines.push(`  instructions: ${JSON.stringify(story.agent.config.instructions.slice(0, 200) + '...')},`);
  lines.push(`  outputMode: '${story.agent.config.outputMode}',`);
  if (story.agent.config.tools && story.agent.config.tools.length > 0) {
    lines.push(`  tools: ${JSON.stringify(story.agent.config.tools)},`);
  }
  lines.push(`});`);
  lines.push('');
  lines.push(`// ─── Run with rules ────────────────────────────────────────`);
  lines.push('');
  lines.push(`const signal = createSignal('groq', {`);
  lines.push(`  apiKey: process.env.GROQ_API_KEY,`);
  lines.push(`  model: 'openai/gpt-oss-120b',`);
  lines.push(`});`);
  lines.push('');
  lines.push(`// The rule watches bus events via accumulators and fires`);
  lines.push(`// effects (inject context, abort) when conditions are met.`);
  lines.push(`// No code hooks. No interceptors. Just JSON.`);
  lines.push(`const result = await runAgentStandalone(`);
  lines.push(`  ${agentVar},`);
  lines.push(`  ${JSON.stringify(story.prompt)},`);
  lines.push(`  {`);
  lines.push(`    llm: signal,`);
  if (story.tools && story.tools.length > 0) {
    const toolVars = story.tools.map((t) => asIdent(t.toolId)).join(', ');
    lines.push(`    tools: [${toolVars}],`);
  }
  lines.push(`    rules: [rule],`);
  lines.push(`    onObservation: (obs) => {`);
  lines.push(`      console.log(\`[\${obs.stepKind}] \${obs.toolId ?? '?'} → \${obs.error ? 'ERR' : 'ok'}\`);`);
  lines.push(`    },`);
  lines.push(`  },`);
  lines.push(`);`);
  lines.push('');
  lines.push(`if (!result.ok) {`);
  lines.push(`  // A rule abort surfaces as result.error — by design.`);
  lines.push(`  console.log('Rule effect:', result.error.message);`);
  lines.push(`} else {`);
  lines.push(`  console.log('Output:', result.data);`);
  lines.push(`}`);
  return lines.join('\n');
};

const generateSnippet = (story: CortexStory): string => {
  if (isPrismMappingStory(story)) return generatePrismMapping(story);
  if (isStructuredExtractStory(story)) return generateStructuredExtract(story);
  if (isToolUseStory(story)) return generateToolUse(story);
  if (isPlanModeStory(story)) return generatePlanMode(story);
  if (isRulesStory(story)) return generateRules(story);
  return '';
};

export const CodeTab: FC<Props> = ({ story }) => {
  const source = generateSnippet(story);
  if (source === '') return <div style={{ padding: 16, color: '#9ca3af' }}>No snippet for this story kind yet.</div>;
  return <CodeView legend={LEGEND} source={source} />;
};
