// CHAT, MIRRORED HEADLESSLY — the real Ray agent (not the build tool bare),
// real tools, mounted assistant, throttled trace publishing, the user's RAW
// message as input. The one chat ingredient it can toggle is SERVER AGE:
// --aged runs a full 120b build first, so the second build sees the first
// one's cache entries and catalog registrations, exactly like a session
// where screens were already built. Bare-harness GLM is clean; chat GLM
// spirals; this isolates which remaining ingredient causes it.
//
//   pnpm --filter relay exec tsx src/dev/ray-mirror.ts [--model=<id>] [--aged]
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CortexEvent } from '@niscorp/cortex';
import { createServer as createHttpServer } from 'node:http';
import { attachSocket } from '@niscorp/moss/node';
import { shell, runtime, server } from './check-shell';
import { mintToken } from '../server/users';
import { rayAgent } from '@relay/server/functions/ray/agent';
import { makeBuildActionTool } from '@relay/server/functions/ray/architect';
import { makeTools, type Turn } from '@relay/server/functions/ray/tools';
import { traceWiring, type TraceStep } from '@relay/server/functions/ray/trace';
import { RAY_STEP_CHANNEL } from '@relay/server/functions/ray/run';
import { rayEngine, type RayContext } from '@relay/server/functions/ray/engine';
import { llmFor, assign, isModelId } from '@relay/server/llm';
import { createScopePolicy, scopeGrants } from '@niscorp/vex';
import { resolvePrincipal } from '@niscorp/charter';
import { CHARTER } from '@relay/app/charter';
import { scopeBehaviors } from '@relay/app/vex/behaviors';
import { TABLES } from '@relay/db/schema';

const MESSAGE_REF = {
  value:
    'build a screen listing all deals closing in june, july or august — make the month a dropdown that reloads ' +
    'the table. columns: title, company, stage, value, close date. clicking a row opens the deal',
};

const main = async (): Promise<void> => {
  const model = process.argv.find((a) => a.startsWith('--model='))?.slice(8);
  if (model !== undefined) {
    if (!isModelId(model)) { console.error('unknown model'); process.exit(2); }
    assign('architect', model); // builder only — the reviewer stays default, like the user's Settings
  }
  const aged = process.argv.includes('--aged');
  // --direct: the measured run calls build_action ITSELF instead of going
  // through Ray. On an aged server Ray rightly just OPENS the screen that
  // already exists (measured: 2s, one stack call) — correct chat behavior,
  // but it dodges the architect, and the poison hypothesis is about the
  // ARCHITECT seeing an aged cache. Direct is how that gets isolated.
  const direct = process.argv.includes('--direct');
  // --attached: a REAL frame consumer on a real websocket, like the browser.
  // Headless-with-no-connections makes every flush free; a connection makes
  // the server render, encode and COMPRESS every changed canvas per flush.
  // The last untested chat ingredient this side of vite itself.
  const attached = process.argv.includes('--attached');

  const policy = createScopePolicy(resolvePrincipal(CHARTER, scopeGrants(TABLES), ['sales', 'dev'], 'data'), scopeBehaviors);
  const ray: RayContext = { shell, userId: 'usr_001', policy, engine: () => rayEngine(runtime, policy) };
  const outDir = join(
    'C:/Users/manxx/AppData/Local/Temp/claude/C--Users-manxx-Development-niscorp/2dcaa551-d6ad-4235-a03c-dfd279d85e40/scratchpad',
    'ray-mirror', new Date().toISOString().replace(/[:.]/g, '-'),
  );
  mkdirSync(outDir, { recursive: true });
  const put = (o: Record<string, unknown>): void => appendFileSync(join(outDir, 'run.jsonl'), JSON.stringify({ t: Date.now(), ...o }) + '\n');

  // Chat's exact furniture: assistant mounted, trace published (throttled, as run.ts now does).
  shell.push('modal', 'assistant');
  await new Promise((r) => setTimeout(r, 1500));

  let frames = 0;
  let bytes = 0;
  if (attached) {
    const httpServer = createHttpServer();
    attachSocket(httpServer, server.socket);
    const port = await new Promise<number>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
      });
    });
    const token = mintToken('alex') ?? '';
    const ws = new WebSocket(`ws://127.0.0.1:${port}/socket?token=${encodeURIComponent(token)}`);
    ws.addEventListener('message', (event: MessageEvent) => {
      frames++;
      bytes += typeof event.data === 'string' ? event.data.length : 0;
    });
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', (e) => reject(new Error(String(e))));
    });
    console.log(`attached: real frame consumer on port ${port}`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  const runRay = async (label: string, builderModel: string | undefined): Promise<void> => {
    if (builderModel !== undefined && isModelId(builderModel)) assign('architect', builderModel);
    const chat = llmFor('chat');
    if ('error' in chat) { console.error(chat.error); process.exit(2); }
    const turn: Turn = {};
    const trace: TraceStep[] = [];
    let pending: TraceStep[] | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wiring = traceWiring(makeTools(ray, turn), trace, (steps) => {
      pending = steps;
      timer ??= setTimeout(() => { timer = undefined; if (pending) shell.publish(RAY_STEP_CHANNEL, pending); pending = undefined; }, 400);
    });
    let events = 0;
    const t0 = Date.now();
    const result = await rayAgent.run([{ role: 'user', content: MESSAGE_REF.value }], {
      llm: chat.llm,
      deps: { shell },
      tools: makeTools(ray, turn),
      onEvent: (e: CortexEvent) => { events++; wiring.onEvent(e); put({ ev: e.type, ...(e.type === 'tool-start' ? { tool: e.call.toolId, input: JSON.stringify(e.call.args).slice(0, 400) } : {}), ...(e.type === 'retry' ? { kind: e.kind, issues: String(e.issues).slice(0, 300) } : {}) }); },
      onToolResult: [wiring.onToolResult],
    }).result;
    if (timer !== undefined) clearTimeout(timer);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const toolCalls = trace.filter((s) => !s.tool.includes('correction')).length;
    console.log(`${label}: ${result.ok ? 'OK' : 'FAIL'}  ${secs}s  traceSteps=${trace.length} toolCalls=${toolCalls} events=${events}`);
    put({ ev: 'done', label, ok: result.ok, secs, traceSteps: trace.length });
  };

  const runDirect = async (label: string, builderModel: string | undefined): Promise<void> => {
    if (builderModel !== undefined && isModelId(builderModel)) assign('architect', builderModel);
    const turn: Turn = {};
    const trace: TraceStep[] = [];
    let pending: TraceStep[] | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const wiring = traceWiring(makeTools(ray, turn), trace, (steps) => {
      pending = steps;
      timer ??= setTimeout(() => { timer = undefined; if (pending) shell.publish(RAY_STEP_CHANNEL, pending); pending = undefined; }, 400);
    });
    const tool = makeBuildActionTool(ray);
    const t0 = Date.now();
    const out = await tool.config.execute(
      { intent: MESSAGE_REF.value },
      { runId: 'mirror', agentId: 'mirror', agentPath: ['mirror'], signal: new AbortController().signal,
        forward: ((e: CortexEvent) => { wiring.onEvent(e); put({ ev: e.type, ...(e.type === 'tool-start' ? { tool: e.call.toolId, input: JSON.stringify(e.call.args).slice(0, 400) } : {}), ...(e.type === 'retry' ? { kind: e.kind, issues: String(e.issues).slice(0, 300) } : {}) }); }) as never },
    );
    if (timer !== undefined) clearTimeout(timer);
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    const ok = typeof out !== 'string';
    console.log(`${label}: ${ok ? 'OK' : 'FAIL'}  ${secs}s  traceSteps=${trace.length}${ok ? '' : `  — ${String(out).slice(0, 140)}`}`);
    put({ ev: 'done', label, ok, secs, traceSteps: trace.length });
  };

  if (aged) {
    // Age like a real session: several DIFFERENT screens built first, their
    // fingerprints and catalog entries left behind.
    const AGE_INTENTS = [
      'A table of the top 10 open deals by value, showing company, stage, value and close date. Click a row to open that deal.',
      'A searchable table of all companies showing name, industry and size. Typing filters the list; clicking a row opens the company.',
      'A pipeline overview: a KPI with the total value of open deals and a table of stages with open-deal count and combined value.',
    ];
    for (let i = 0; i < AGE_INTENTS.length; i++) {
      const save = MESSAGE_REF.value;
      MESSAGE_REF.value = AGE_INTENTS[i] ?? save;
      await runDirect(`age-build ${i + 1} (120b)`, 'groq-120b');
      MESSAGE_REF.value = save;
    }
  }
  const label = `measured (${model ?? 'default'})${aged ? ' on AGED server' : ' on VIRGIN server'}${direct ? ' DIRECT' : ' via Ray'}${attached ? ' ATTACHED' : ''}`;
  if (direct) await runDirect(label, model);
  else await runRay(label, model);
  if (attached) console.log(`frames received: ${frames}  bytes: ${(bytes / 1024).toFixed(0)}KB`);
  console.log('logs:', outDir);
  process.exit(0);
};

void main();
