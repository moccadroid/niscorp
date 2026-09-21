import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { createIntentLoop } from './loop';
import type { IntentDeps, IntentLoop } from './loop';

// THE LOOP'S ENDPOINTS, and the roster of loops behind them.
//
// These are `functions(session)` handlers because they are exactly what that
// seam is for: things an action CALLS. `encore.intent` is the line's trigger,
// `encore.promote` a chip's, `encore.run` the line's Enter key, `encore.step` a
// plan step's chip, `encore.thread` and `encore.newThread` the answer card's
// conversation. None of them waits — not for a pass, and certainly not for an
// agent — so a slow provider can never hold a keystroke's round trip open.
//
// One loop per principal, because moss keeps one durable shell per principal.
// A shell reset rebuilds the session and calls this again; the new loop
// replaces the old in the roster, and the old one's shell is already disposed.

export type IntentLoops = {
  functionsFor: (session: FunctionSession) => Record<string, FunctionHandler>;
  // For in-process hosts — the checks await `idle()` between keystrokes and
  // read pass records back. Nothing on a wire reaches this.
  of: (principal: string | null) => IntentLoop | undefined;
  // The session a principal's loop closes over — its wire and its policy are
  // what a check builds the agent's read tools from, to call them directly.
  sessionOf: (principal: string | null) => FunctionSession | undefined;
  // A WRITE LANDED on a table the room watches (app.ts `reactions`). Every live
  // session is told THAT — and re-reads, or cannot, under its own policy.
  notifyFeed: (table: string) => void;
};

// What the director's deck may ask of it. The director itself is boot's.
export type DirectorControls = { command: (command: string) => unknown };

const ANONYMOUS = 'anonymous';

const textOf = (value: unknown): string => (typeof value === 'string' ? value : '');

export const createIntentLoops = (deps: IntentDeps, director?: DirectorControls): IntentLoops => {
  const roster = new Map<string, IntentLoop>();
  const sessions = new Map<string, FunctionSession>();

  return {
    functionsFor: (session) => {
      const loop = createIntentLoop(session, deps);
      roster.set(session.principal ?? ANONYMOUS, loop);
      sessions.set(session.principal ?? ANONYMOUS, session);
      return {
        // The `model:` write lands before the trigger fires, so the sentence is
        // already in the data this is handed.
        'encore.intent': async (data) => loop.submit(textOf(data['text'])),
        'encore.promote': async (data) => loop.promote(textOf(data['promoteId'])),
        // Enter on the line: start the text model now. Returns at once, like
        // everything here — the run reports itself on its own card.
        'encore.run': async () => loop.runNow(),
        // The line took focus: open the provider connection before the first
        // keystroke needs it. Returns at once; the outcome lands in the trace.
        'encore.warm': async () => loop.warm(),
        // A plan step's chip: open that step's card, prefilled. The index is
        // checked against the landed plan; a terminal can send any number.
        'encore.step': async (data) => loop.openStep(typeof data['stepIndex'] === 'number' ? data['stepIndex'] : -1),
        // The answer card's conversation: the caller's own turns, read back
        // through the wire every time it is asked for — rows, not a closure.
        'encore.thread': async () => loop.earlierTurns(),
        // "New thread": the operator's click, and the only thing that ever ends
        // a thread. It is a write like every other — a row, through the wire.
        'encore.newThread': async () => loop.newThread(),
        // The x-ray switch: the operator's click or key. Returns the new state.
        'encore.xray': async () => loop.toggleXray(),
        // The director's deck: play, pause, faster, slower — or just "how is it
        // going". Only a principal who holds the deck can mount what calls this.
        'encore.director': async (data) => (session.actions.includes('director.deck') ? (director?.command(textOf(data['command'])) ?? {}) : {}),
      };
    },
    of: (principal) => roster.get(principal ?? ANONYMOUS),
    sessionOf: (principal) => sessions.get(principal ?? ANONYMOUS),
    notifyFeed: (table) => {
      for (const loop of roster.values()) loop.notifyFeed(table);
    },
  };
};
