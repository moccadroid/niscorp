// Bench: the architect over a graded prompt suite — same env, same validation,
// the same models the app is set to. Run:
//
//   pnpm --filter relay exec tsx src/dev/architect-bench.ts
//   ... [--only=<prompt-id>] [--edit] [--model=<id>]
//
// --edit runs the edit-drift probe; --model puts the ARCHITECT on one roster
// model for this run (its reviewer and support agents stay where they are), so
// two runs compare models over the same suite.
//
// Prints per run: ok, duration, tool calls, retries by kind (the events carry
// the evidence), what each endpoint loaded at mount; writes every produced
// ActionDefinition to a temp folder for eyeballing.
// .env (the LLM keys) loads first — Node's own loader, same idiom as
// server/boot.ts; the bench never reaches the server's composition.
try {
  process.loadEnvFile();
} catch {
  /* no .env present */
}

import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CortexEvent } from '@niscorp/cortex';
import { assign, isModelId, MODELS } from '@relay/server/llm';
import { architectLlms, runActionArchitect, runAction, type BuildLlms, type BuildResult } from '@relay/server/functions/ray/architect';
import { devRayContext } from './engine';

type PromptCase = { id: string; intent: string };

// Graded by ambition: a scalar, a searchable list, a two-dataset overview,
// and a genuinely complex interactive workspace.
const PROMPTS: PromptCase[] = [
  {
    id: 'kpi',
    intent: 'A single KPI screen: the total number of open tasks, big, with a one-line label under it.',
  },
  {
    id: 'list',
    intent:
      'A searchable table of all companies showing name, industry and size. Typing in the search box filters the list; clicking a row opens that company.',
  },
  {
    id: 'overview',
    intent:
      'A pipeline overview: a headline KPI with the total value of open deals, and below it a table of pipeline stages with the open-deal count and combined value per stage, sorted by combined value descending. Clicking a stage row opens the deals list.',
  },
  {
    id: 'workspace',
    intent:
      'A my-day workspace: my open tasks ordered by due date with a checkbox per row that marks the task done and refreshes the list, a KPI of how many of my tasks are overdue, and a table of my 5 biggest open deals (company, value, close date) where clicking a deal opens it. A "New task" button opens the task form.',
  },
];

type RunStats = {
  ok: boolean;
  ms: number;
  toolCalls: number;
  outputRetries: number;
  terminationRetries: number;
  providerRetries: number;
  nestedRetries: number;
  error?: string;
  loaded: string[];
};

const collectStats = (events: CortexEvent[], result: BuildResult, ms: number, loaded: string[]): RunStats => {
  const own = events.filter((event) => event.agentPath.length === 1);
  const retriesOf = (kind: string): number =>
    own.filter((event) => event.type === 'retry' && event.kind === kind).length;
  return {
    ok: result.ok,
    ms,
    toolCalls: own.filter((event) => event.type === 'tool-start').length,
    outputRetries: retriesOf('output'),
    terminationRetries: retriesOf('termination'),
    providerRetries: retriesOf('provider'),
    nestedRetries: events.filter((event) => event.agentPath.length > 1 && event.type === 'retry').length,
    ...(result.ok ? {} : { error: result.error }),
    loaded,
  };
};

// Mount the produced action once more and report what each endpoint target
// actually holds — the "is this a real screen" number.
const loadedTargets = async (result: BuildResult): Promise<string[]> => {
  if (!result.ok) return [];
  const check = await runAction(devRayContext(), result.action);
  const endpoints = result.action.endpoints ?? {};
  return Object.values(endpoints)
    .map((endpoint) => ('target' in endpoint ? endpoint.target : undefined))
    .filter((target): target is string => typeof target === 'string')
    .map((target) => {
      const value = check.data[target];
      if (Array.isArray(value)) return `${target}: ${value.length} rows`;
      if (value !== null && typeof value === 'object') return `${target}: object`;
      return `${target}: ${JSON.stringify(value)}`;
    });
};

const statsLine = (label: string, stats: RunStats): string =>
  `  ${label.padEnd(9)} ${stats.ok ? 'OK  ' : 'FAIL'} ${String(Math.round(stats.ms / 100) / 10).padStart(5)}s` +
  `  tools:${stats.toolCalls}  retries o:${stats.outputRetries} t:${stats.terminationRetries} p:${stats.providerRetries}` +
  `${stats.nestedRetries > 0 ? ` nested:${stats.nestedRetries}` : ''}` +
  `  ${stats.ok ? stats.loaded.join(' · ') : `— ${stats.error ?? ''}`}`;

// ── edit-drift probe (--edit): build once, request ONE trigger change, then
// diff the sections the edit had no reason to touch. Transcription drift —
// the model retyping 100 lines to change 3 and mangling an unrelated part —
// becomes a measured verdict per section instead of a vibe. This is the
// evidence that decides whether full-re-emit editing survives or
// section-scoped merging replaces it.
const editProbe = async (llms: BuildLlms, outDir: string): Promise<void> => {
  const buildIntent = PROMPTS.find((prompt) => prompt.id === 'list')?.intent ?? '';
  console.log(`\n═══ edit-drift ═══\n${buildIntent}`);
  const build = await runActionArchitect(devRayContext(), llms.agent, llms.support, buildIntent, {});
  if (!build.ok) {
    console.log(`  base build failed (${build.error}) — probe skipped`);
    return;
  }
  const base = build.action;
  writeFileSync(join(outDir, 'edit-drift.base.json'), JSON.stringify(base, null, 2));

  const t0 = Date.now();
  const edited = await runActionArchitect(
    devRayContext(),
    llms.agent,
    llms.support,
    'Change ONLY the row click: clicking a row must open the company FORM (company.form) seeded with the clicked company id, instead of the company detail. Everything else stays exactly as it is.',
    { base },
  );
  const ms = Date.now() - t0;
  if (!edited.ok) {
    console.log(`  edit failed (${edited.error}) after ${Math.round(ms / 100) / 10}s`);
    return;
  }
  writeFileSync(join(outDir, 'edit-drift.edited.json'), JSON.stringify(edited.action, null, 2));

  // `triggers` is EXPECTED to change; every other section should survive
  // byte-identical (modulo key order — JSON.stringify of untouched objects
  // re-emitted by the model is exactly what we're measuring).
  const untouched = ['data', 'endpoints', 'lifecycle', 'layout', 'title', 'name'] as const;
  console.log(`  edit ${Math.round(ms / 100) / 10}s`);
  for (const section of untouched) {
    const before = JSON.stringify(base[section]);
    const after = JSON.stringify(edited.action[section]);
    console.log(`  ${section.padEnd(10)} ${before === after ? 'unchanged' : 'DRIFTED'}`);
  }
  const triggersChanged = JSON.stringify(base.triggers) !== JSON.stringify(edited.action.triggers);
  console.log(`  triggers   ${triggersChanged ? 'changed (expected)' : 'UNCHANGED — the edit did nothing'}`);
};

const main = async (): Promise<void> => {
  const wanted = process.argv.find((arg) => arg.startsWith('--model='))?.slice(8);
  if (wanted !== undefined) {
    if (!isModelId(wanted)) {
      console.error(`Unknown model "${wanted}". Known: ${Object.keys(MODELS).join(', ')}`);
      process.exit(1);
    }
    assign('architect', wanted);
  }
  const llms = architectLlms();
  if ('error' in llms) {
    console.error(llms.error);
    process.exit(1);
  }
  const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7);
  const withEdit = process.argv.includes('--edit');

  const outDir = join(tmpdir(), 'relay-architect-bench', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });

  const cases = PROMPTS.filter((prompt) => only === undefined || prompt.id === only);
  const agents = [{ label: 'architect', run: runActionArchitect }];

  const summary: string[] = [];
  for (const prompt of cases) {
    console.log(`\n═══ ${prompt.id} ═══\n${prompt.intent}`);
    summary.push(`\n${prompt.id}`);
    for (const agent of agents) {
      const events: CortexEvent[] = [];
      const t0 = Date.now();
      const result = await agent.run(devRayContext(), llms.agent, llms.support, prompt.intent, { onEvent: (event) => events.push(event) });
      const ms = Date.now() - t0;
      const loaded = await loadedTargets(result);
      const stats = collectStats(events, result, ms, loaded);
      const text = statsLine(agent.label, stats);
      console.log(text);
      summary.push(text);
      if (result.ok) {
        const file = join(outDir, `${prompt.id}.${agent.label}.json`);
        writeFileSync(file, JSON.stringify(result.action, null, 2));
      }
    }
  }

  if (withEdit) await editProbe(llms, outDir);

  console.log(`\n═══ summary ═══${summary.join('\n')}`);
  console.log(`\nactions written to ${outDir}`);
};

main().catch((err: unknown) => {
  console.error('BENCH FAILED:', err);
  process.exit(1);
});
