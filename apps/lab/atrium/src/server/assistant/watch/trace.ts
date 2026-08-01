import type { Message } from '@niscorp/signal';

// ═══════════════════════════════════════════════════════════
// THE TRACE — what the model was actually shown, kept.
//
// The context is producers over live shell state, so the only honest answer to
// "what does it see" is the assembled messages. Every wake keeps them, taken from
// cortex's own `agent.preview()` — the same pure assembly the run performs, so
// this is the request that went out rather than a reconstruction that can drift.
// Preview needs no key, which is what lets the keyless check assert on it.
//
// In-memory and per session. The durable record is `assistant_runs`.
// ═══════════════════════════════════════════════════════════

const RING = 20;

export type Outcome =
  | 'acted' // the agent changed the screen
  | 'quiet' // it looked and chose to add nothing
  | 'no-key' // no provider key configured: assembled, never sent
  | 'cancelled' // they navigated mid-run: the premise was gone, so nothing landed
  | 'failed';

export type Wake = {
  principal: string;
  at: number;
  // Why it woke: the aim diff, the world's rises, or both.
  reasons: readonly string[];
  outcome: Outcome;
  // Every message the run sent, in order — the literal prompt.
  context: readonly Message[];
  estimatedTokens: number;
  reply: string;
};

const ring: Wake[] = [];

const asText = (message: Message): string =>
  typeof message.content === 'string' ? message.content : JSON.stringify(message.content);

export const printable = (wake: Wake): string =>
  [
    `── wake ${new Date(wake.at).toISOString()} · ${wake.principal} · ${wake.outcome} · ~${wake.estimatedTokens} tokens`,
    ...wake.reasons.map((reason) => `   why: ${reason}`),
    ...wake.context.map((message) => `\n[${message.role}]\n${asText(message)}`),
    wake.reply === '' ? '' : `\n[reply]\n${wake.reply}`,
  ].join('\n');

export const recordWake = (wake: Wake): void => {
  ring.push(wake);
  while (ring.length > RING) ring.shift();
  if (process.env['WATCH_TRACE'] === '1') console.log(printable(wake));
};

export const wakes = (principal?: string): readonly Wake[] =>
  principal === undefined ? ring : ring.filter((wake) => wake.principal === principal);

export const clearWakes = (): void => {
  ring.length = 0;
};
