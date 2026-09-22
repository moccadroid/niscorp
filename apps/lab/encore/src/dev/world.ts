import { createReporter, createWorld } from './world-factory';

// THE DEFAULT WORLD — the one the fast-path checks share: the fake decider, and
// the slow path OFF. Off, not faked: these checks assert what Jev's pass does,
// and a text model landing seven hundred milliseconds into an assertion about
// a form's body would make every one of them a race. The context questions are
// still asked in every pass here — that is what `off` means — so the width these
// checks measure is the real width.
//
// The two-speeds check builds its own worlds (world-factory.ts).

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
