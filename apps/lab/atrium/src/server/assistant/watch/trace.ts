import type { Message } from '@niscorp/signal';

const RING = 20;

export type Outcome =
  | 'acted'
  | 'quiet'
  | 'no-key'
  | 'cancelled'
  | 'failed';

export type Wake = {
  principal: string;
  at: number;
  reasons: readonly string[];
  outcome: Outcome;
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
