import { createReporter, createWorld } from './world-factory';

// The slow path is off, not faked: these checks assert what Jev's pass does, and
// a text model landing mid-assertion would make every one of them a race. The
// context questions are still asked in every pass, so the width is the real one.
const world = await createWorld({ agent: { kind: 'off' } });
const reporter = createReporter();

export { settle, mounted, cardData } from './world-factory';

export const server = world.booted.server;
export const runtime = world.booted.runtime;
export const app = world.booted.app;
export const decider = world.booted.decider;
export const intent = world.booted.intent;

export const tokenFor = world.tokenFor;
export const login = world.login;
export const servedTo = world.servedTo;
export const keystroke = world.keystroke;
export const typeLine = world.typeLine;
export const passesOf = world.passesOf;
export const sql = world.sql;
export const asPrincipal = world.asPrincipal;

export const check = reporter.check;
export const report = (title: string): Promise<never> => reporter.report(title, [world]);
