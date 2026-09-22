import { defaultScript } from '@encore/server/agent/fake-llm';
import type { AgentScript } from '@encore/server/agent/fake-llm';
import type { Shell } from '@niscorp/nova';
import { mintDevToken } from '@niscorp/moss';
import { boot } from '@encore/server/boot';
import type { Booted } from '@encore/server/boot';
import type { PassRecord, RunRecord } from '@encore/server/intent/intent.types';
import type { AgentLlmConfig } from '@encore/server/agent/llm';
import type { DeciderConfig } from '@encore/server/decider/decider';
import type { DecidedPass } from '@encore/server/intent/loop';

// A WORLD, MADE TO ORDER: one moss over one fresh database, with the decision
// provider PINNED to the fake on a free port — whatever a developer's .env
// says. A suite that needed a key, a network or a particular port would be a
// suite about the environment.
//
// A factory rather than a module-level boot because the two-speeds check needs
// more than one world in a process: one with the scripted agent model, one with
// the agent switched off. `world.ts` is the default one the other checks share.
//
// `login()` hands back the SERVER'S OWN living shell for a principal — the same
// durable nova Shell the socket streams — so a check drives the real thing
// rather than a replica. `runtime.db` is SQL ground truth: the same database
// the server reads.

export type WorldOptions = {
  agent: Partial<AgentLlmConfig>;
  traceDir?: string;
  eventPassesPerSecond?: number;
  now?: () => number;
  // A probe points the same world at a real provider; a check never sets this.
  decider?: Partial<DeciderConfig>;
  onDecided?: (principal: string | null, decided: DecidedPass) => void;
};

type Session = NonNullable<Awaited<ReturnType<NonNullable<Booted['server']['shells']>['session']>>>;

export type World = {
  booted: Booted;
  tokenFor: (principal: string) => string;
  login: (principal: string) => Promise<Shell>;
  servedTo: (principal: string) => readonly string[];
  keystroke: (principal: string, text: string) => void;
  typeLine: (principal: string, text: string) => Promise<void>;
  // Dispatch the way the socket does: on a canvas, stamped with its active
  // instance — or with a named card's instance, for a list canvas.
  dispatchOn: (principal: string, canvas: string, event: Record<string, unknown>, actionId?: string) => void;
  // Both speeds at rest: no pass, no armed handoff, no run.
  settled: (principal: string) => Promise<void>;
  passesOf: (principal: string) => PassRecord[];
  // The LATEST state of every run, by run number: a run is reported when it
  // starts and again when it ends.
  runsOf: (principal: string) => RunRecord[];
  // Flip the room between the app and its instruments, as the operator's key
  // would. A check that reads META off the rendering turns it on first.
  xray: (principal: string) => Promise<boolean>;
  sql: (text: string, values?: unknown[]) => Promise<Record<string, unknown>[]>;
  // Rows per table of the app's own schema — what a check compares before and
  // after a run, to prove the only table an agent's turn grows is its thread.
  tableCounts: () => Promise<Record<string, number>>;
  asPrincipal: (principal: string, path: string, body: unknown) => Promise<{ status: number; json: unknown }>;
  close: () => Promise<void>;
};

// Mount fires an endpoint whose onSuccess fires another; a check has to outwait
// the whole chain, not the first promise.
export const settle = async (ticks = 6): Promise<void> => {
  for (let i = 0; i < ticks; i++) await new Promise((resolve) => setTimeout(resolve, 25));
};

export const mounted = (shell: Shell, canvas: string): string[] => (shell.getState().canvases[canvas]?.stack ?? []).map((item) => item.definitionId);

export const cardData = (shell: Shell, canvas: string, actionId: string): Record<string, unknown> => {
  const instance = shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId);
  return instance === undefined ? {} : (shell.getRuntime(instance.id)?.getData() ?? {});
};

export const createWorld = async (options: WorldOptions): Promise<World> => {
  const passes: { principal: string | null; record: PassRecord }[] = [];
  const runs: { principal: string | null; record: RunRecord }[] = [];

  const booted = await boot({
    decider: { kind: 'fake', port: 0, latencyMs: 0, noulFloor: 0, ...options.decider },
    agent: options.agent,
    ...(options.traceDir !== undefined ? { traceDir: options.traceDir } : {}),
    ...(options.eventPassesPerSecond !== undefined ? { eventPassesPerSecond: options.eventPassesPerSecond } : {}),
    ...(options.now !== undefined ? { now: options.now } : {}),
    ...(options.onDecided !== undefined ? { onDecided: options.onDecided } : {}),
    onPass: (principal, record) => passes.push({ principal, record }),
    onRun: (principal, record) => runs.push({ principal, record }),
  });
  const { server, runtime, intent } = booted;

  const tokenFor = (principal: string): string => mintDevToken(principal);

  // A TERMINAL IS ATTACHED, because a person typing is looking at a screen. It
  // is not decoration: nova installs an input's `ui:model` listener when the
  // node that carries it is RENDERED, and a durable shell nobody has attached
  // to has rendered nothing — the first keystroke would reach the trigger with
  // the model write missing. So the check does what the socket does: attach, be
  // served every canvas, then type. The terminal keeps what it is sent, so a
  // check can also read the wire.
  const sessions = new Map<string, Session>();
  const served = new Map<string, string[]>();

  const sessionOf = (principal: string): Session => {
    const session = sessions.get(principal);
    if (session === undefined) throw new Error(`world: "${principal}" has not logged in`);
    return session;
  };

  const keystroke = (principal: string, text: string): void => {
    // `session.dispatch` is the socket's own path: it stamps the canvas's
    // active instance as the event's origin, exactly as it does for a browser.
    sessionOf(principal).dispatch('line', { type: 'ui:model', ref: 'line', payload: text });
  };

  return {
    booted,
    tokenFor,
    login: async (principal) => {
      const session = await server.shells?.session(tokenFor(principal), principal);
      if (session === undefined || session === null) throw new Error('world: the app serves no shell');
      const messages: string[] = [];
      session.attach({ send: (text) => messages.push(text), close: () => {}, onMessage: () => {}, onClose: () => {} });
      sessions.set(principal, session);
      served.set(principal, messages);
      return session.shell;
    },
    servedTo: (principal) => served.get(principal) ?? [],
    keystroke,
    // TYPE INTO THE LINE, the way a terminal does, then wait for the FAST path
    // to stop moving — the endpoint returns at once, so "done" is the pacer
    // going idle, plus the mount chains of whatever it placed. The slow path
    // is deliberately NOT awaited here: a check that wants it asks `settled`.
    typeLine: async (principal, text) => {
      keystroke(principal, text);
      await settle(2);
      await intent.of(principal)?.idle();
      await settle(8);
    },
    dispatchOn: (principal, canvas, event, actionId) => {
      const session = sessionOf(principal);
      const instance = actionId === undefined ? undefined : session.shell.getState().canvases[canvas]?.stack.find((item) => item.definitionId === actionId);
      session.dispatch(canvas, instance === undefined ? event : { ...event, origin: instance.id });
    },
    settled: async (principal) => {
      await settle(2);
      await intent.of(principal)?.settled();
      await settle(8);
    },
    passesOf: (principal) => passes.filter((entry) => entry.principal === principal).map((entry) => entry.record),
    runsOf: (principal) => {
      const latest = new Map<number, RunRecord>();
      for (const entry of runs) if (entry.principal === principal) latest.set(entry.record.run, entry.record);
      return [...latest.values()];
    },
    // X-RAY IS ITS PANEL BEING OPEN — pressed the way a person presses it.
    xray: async (principal) => {
      const shell = sessionOf(principal).shell;
      const panel = shell.getState().canvases['trace']?.stack.find((item) => item.definitionId === 'intent.trace');
      const isOpen = panel !== undefined && shell.getRuntime(panel.id)?.getData()['open'] === true;
      sessionOf(principal).dispatch('trace', { type: 'ui:click', ref: isOpen ? 'shut' : 'open', ...(panel === undefined ? {} : { origin: panel.id }) });
      await settle(4);
      return !isOpen;
    },
    sql: async (text, values = []) => (await runtime.pool.query(text, values)).rows,
    tableCounts: async () => {
      const tables = (await runtime.pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name", [])).rows;
      const counts: Record<string, number> = {};
      for (const row of tables) {
        const name = String(row['table_name']);
        // Identifiers come from the catalog itself, never from a caller.
        const counted = (await runtime.pool.query(`SELECT count(*)::int AS n FROM "${name}"`, [])).rows[0];
        counts[name] = Number(counted?.['n'] ?? 0);
      }
      return counts;
    },
    // A request to the real vex surface as a given principal — Bearer token
    // and all, the path a browser or a curl takes.
    asPrincipal: async (principal, path, body) => {
      const response = await server.request(path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenFor(principal)}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: response.status, json: await response.json() };
    },
    close: booted.close,
  };
};

// ─── a plan, scripted ────────────────────────────────────────
// The default scripted assistant never proposes steps: nothing in the STATE says a
// plan is wanted, and only a model that reads the sentence can tell. A check that
// needs a plan on the card says which.
export type ScriptedStep = { say: string; actionId: string; input: Record<string, unknown> };

export const planOf =
  (steps: readonly ScriptedStep[]): AgentScript =>
  (turn) =>
    turn.predecisions.facts['standing'] !== undefined ? defaultScript(turn) : { answer: { response: `${steps.length} step(s), most consequential first. Nothing is sent until you press it.`, data: { steps } } };

export const STORM_PLAN_STEPS: readonly ScriptedStep[] = [
  { say: 'Move a set — Nova Kestrel', actionId: 'slot.swap', input: { actId: 'act_nova_kestrel' } },
  { say: 'Delay a set — Nova Kestrel', actionId: 'set.delay', input: { actId: 'act_nova_kestrel' } },
  { say: 'Push to attendees', actionId: 'push.compose', input: {} },
];

// ─── the reporter ────────────────────────────────────────────

export type Reporter = { check: (label: string, pass: boolean) => void; report: (title: string, worlds: readonly World[]) => Promise<never> };

export const createReporter = (): Reporter => {
  const results: boolean[] = [];
  return {
    check: (label, pass) => {
      results.push(pass);
      console.log(`${pass ? '[pass]' : '[fail]'} ${label}`);
    },
    report: async (title, worlds) => {
      const failed = results.filter((ok) => !ok).length;
      console.log(failed === 0 ? `\nOK — ${title} (${results.length} assertions)` : `\nFAIL — ${failed} of ${results.length} assertions failed in ${title}`);
      for (const world of worlds) await world.close();
      process.exit(failed === 0 ? 0 : 1);
    },
  };
};
