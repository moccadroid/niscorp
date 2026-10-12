import type { FunctionHandler } from '@niscorp/nova';
import type { FunctionSession } from '@niscorp/moss';
import { createIntentLoop } from './loop';
import type { IntentDeps, IntentLoop } from './loop';

export type IntentLoops = {
  functionsFor: (session: FunctionSession) => Record<string, FunctionHandler>;
  of: (principal: string | null) => IntentLoop | undefined;
  sessionOf: (principal: string | null) => FunctionSession | undefined;
  notifyFeed: (table: string) => void;
};

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
        'encore.intent': async (data) => loop.submit(textOf(data['text'])),
        'encore.promote': async (data) => loop.promote(textOf(data['promoteId'])),
        'encore.run': async () => loop.runNow(),
        'encore.warm': async () => loop.warm(),
        'encore.step': async (data) => loop.openStep(typeof data['stepIndex'] === 'number' ? data['stepIndex'] : -1),
        'encore.thread': async () => loop.earlierTurns(),
        'encore.newThread': async () => loop.newThread(),
        'encore.story': async (data) => loop.stepStory(textOf(data['command'])),
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
