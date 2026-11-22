import OpenAI from 'openai';

export type Chunk = Record<string, unknown>;
export type Turn = { chunks?: Chunk[]; status?: number; headers?: Record<string, string>; json?: unknown; error?: Record<string, unknown> };

export const textChunk = (text: string): Chunk => ({ choices: [{ index: 0, delta: { content: text }, finish_reason: null }] });
export const toolCallChunk = (index: number, piece: { id?: string; name?: string; args?: string }): Chunk => ({
  choices: [{
    index: 0,
    delta: {
      tool_calls: [{
        index,
        ...(piece.id !== undefined && { id: piece.id, type: 'function' }),
        function: { ...(piece.name !== undefined && { name: piece.name }), ...(piece.args !== undefined && { arguments: piece.args }) },
      }],
    },
    finish_reason: null,
  }],
});
export const finishChunk = (reason: string): Chunk => ({ choices: [{ index: 0, delta: {}, finish_reason: reason }] });

// The real openai SDK, its retries included, over a fetch that answers scripted turns.
export const sdkOverFetch = (turns: Turn[], maxRetries = 0): { client: OpenAI; requests: () => number } => {
  let at = 0;
  const fetch = async (_url: unknown, init?: { body?: unknown }): Promise<Response> => {
    const body: unknown = JSON.parse(String(init?.body));
    const turn = turns[at];
    at += 1;
    if (!turn) throw new Error(`no scripted turn ${at - 1}`);
    if (turn.status !== undefined) {
      return new Response(JSON.stringify({ error: { message: 'err', ...turn.error } }), { status: turn.status, headers: { 'content-type': 'application/json', ...turn.headers } });
    }
    const streaming = typeof body === 'object' && body !== null && 'stream' in body && body.stream === true;
    if (!streaming) return new Response(JSON.stringify(turn.json), { status: 200, headers: { 'content-type': 'application/json' } });
    const sse = (turn.chunks ?? []).map((chunk) => `data: ${JSON.stringify({ id: 'x', object: 'chat.completion.chunk', model: 'm', created: 0, ...chunk })}\n\n`).join('');
    return new Response(`${sse}data: [DONE]\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  return { client: new OpenAI({ apiKey: 'k', baseURL: 'http://fake.local/v1', fetch, maxRetries }), requests: () => at };
};
