import { z } from 'zod';
import type { DecisionAdapter, DecisionRequest, DecisionResponse } from '../types';
import { SignalError, ErrorCode } from '../errors';

// ═══════════════════════════════════════════════════════════
// The System One wire — state and typed questions in, answers out
// ═══════════════════════════════════════════════════════════
//
// One POST, one JSON body back: `{ model, answers, usage }`. TypeSafe's Jev is
// the first provider to speak it; like every adapter this one exists per wire
// protocol, and the vendor is a registry row over it. There is no SDK to load —
// the protocol is a single fetch — so the injected client is just a `fetch`,
// which is also how a check points it at a fake provider.

export type SystemOneConfig = {
  apiKey: string;
  baseUrl: string;
  client?: unknown;
};

const InjectedClientSchema = z.object({
  fetch: z.custom<typeof fetch>((value) => typeof value === 'function'),
});

const BodySchema = z.object({
  model: z.string().optional(),
  answers: z.unknown(),
  usage: z.object({ input_tokens: z.number(), output_tokens: z.number() }).optional(),
});

const sendOf = (client: unknown): typeof fetch => {
  if (client === undefined) return fetch;
  const injected = InjectedClientSchema.safeParse(client);
  if (!injected.success) {
    throw new SignalError('Invalid client: expected client.fetch to be a function', ErrorCode.PROVIDER_ERROR);
  }
  return injected.data.fetch;
};

const jsonOrText = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const providerError = (message: string, raw: unknown): SignalError =>
  new SignalError(`Provider error: ${message}`, ErrorCode.PROVIDER_ERROR, { raw });

export const createSystemOneAdapter = async (config: SystemOneConfig): Promise<DecisionAdapter> => {
  const send = sendOf(config.client);
  const url = `${config.baseUrl.replace(/\/+$/, '')}/systemone`;

  const decide = async (request: DecisionRequest, options?: { signal?: AbortSignal }): Promise<DecisionResponse> => {
    let status: number;
    let body: unknown;
    try {
      const response = await send(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: request.model, state: request.state, questions: request.questions }),
        ...(options?.signal !== undefined && { signal: options.signal }),
      });
      status = response.status;
      body = jsonOrText(await response.text());
    } catch (error) {
      // Adapters are dumb: wrap and throw, ORIGINAL error under raw. An abort
      // lands here too — the caller holds the signal and knows it fired.
      throw providerError(error instanceof Error ? error.message : String(error), error);
    }
    if (status < 200 || status >= 300) throw providerError(`HTTP ${status}`, { status, body });

    // A body that is not the protocol's shape still goes back as it arrived:
    // the gate rejects it, with these bytes as the evidence.
    const parsed = BodySchema.safeParse(body);
    if (!parsed.success) return { answers: undefined, raw: body };
    return {
      ...(parsed.data.model !== undefined && { model: parsed.data.model }),
      answers: parsed.data.answers,
      ...(parsed.data.usage !== undefined && {
        usage: { inputTokens: parsed.data.usage.input_tokens, outputTokens: parsed.data.usage.output_tokens },
      }),
      raw: body,
    };
  };

  return { kind: 'decisions', id: 'systemone', decide };
};
