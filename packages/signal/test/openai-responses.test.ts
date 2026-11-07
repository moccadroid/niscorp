import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSignal, defineTool, ErrorCode } from '../src';

type Params = Record<string, unknown>;

const fakeClient = (replies: Array<(params: Params) => unknown>) => {
  const sent: Params[] = [];
  const requestOptions: unknown[] = [];
  const client = {
    responses: {
      create: async (params: Params, options?: unknown) => {
        sent.push(params);
        requestOptions.push(options);
        const reply = replies[sent.length - 1];
        if (reply === undefined) throw new Error(`no reply scripted for call ${sent.length}`);
        return reply(params);
      },
    },
  };
  return { client, sent, requestOptions };
};

const collect = async (stream: AsyncIterable<unknown>): Promise<unknown[]> => {
  const events: unknown[] = [];
  for await (const event of stream) events.push(event);
  return events;
};

const streamOf = (events: unknown[]) => () =>
  (async function* () {
    for (const event of events) yield event;
  })();

const completed = (output: unknown[], status = 'completed', extra: Record<string, unknown> = {}) => ({
  type: `response.${status}`,
  response: { status, output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, ...extra },
});

describe('openai-responses — a tool loop over the stream', () => {
  it('sends flat non-strict tools, threads the call and its result back as items, and answers', async () => {
    const call = { type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '' };
    const { client, sent } = fakeClient([
      streamOf([
        { type: 'response.output_item.added', output_index: 1, item: call },
        { type: 'response.function_call_arguments.delta', output_index: 1, delta: '{"city":' },
        { type: 'response.function_call_arguments.delta', output_index: 1, delta: '"Vienna"}' },
        completed([{ type: 'reasoning', summary: [] }, { ...call, arguments: '{"city":"Vienna"}' }]),
      ]),
      streamOf([
        { type: 'response.output_text.delta', delta: 'Sunny in ' },
        { type: 'response.output_text.delta', delta: 'Vienna.' },
        completed([{ type: 'message', content: [{ type: 'output_text', text: 'Sunny in Vienna.' }] }]),
      ]),
    ]);
    const weather = defineTool({
      name: 'weather',
      description: 'The weather in a city.',
      input: z.object({ city: z.string() }),
      execute: ({ city }) => `sunny in ${city}`,
    });

    const { response, meta } = await createSignal('openai-responses', { apiKey: 'k', client })
      .systemPrompt('Be brief.')
      .tools([weather])
      .complete('Weather in Vienna?');

    expect(response).toBe('Sunny in Vienna.');
    expect(meta.toolCalls).toEqual([expect.objectContaining({ name: 'weather', args: { city: 'Vienna' }, result: 'sunny in Vienna' })]);
    expect(meta.usage.totalTokens).toBe(30);

    const first = sent[0];
    expect(first?.['store']).toBe(false);
    expect(first?.['tools']).toEqual([expect.objectContaining({ type: 'function', name: 'weather', strict: false, parameters: expect.any(Object) })]);
    expect(first?.['input']).toEqual([
      { role: 'system', content: expect.stringContaining('Be brief.') },
      { role: 'user', content: 'Weather in Vienna?' },
    ]);
    expect(sent[1]?.['input']).toEqual(expect.arrayContaining([
      { type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{"city":"Vienna"}' },
      { type: 'function_call_output', call_id: 'call_1', output: expect.stringContaining('sunny in Vienna') },
    ]));
  });

  it('streams reasoning apart from the text', async () => {
    const { client } = fakeClient([
      streamOf([
        { type: 'response.reasoning_text.delta', delta: 'Thinking it over.' },
        { type: 'response.output_text.delta', delta: 'Yes.' },
        completed([{ type: 'message', content: [{ type: 'output_text', text: 'Yes.' }] }]),
      ]),
    ]);
    const events = await collect(createSignal('openai-responses', { apiKey: 'k', client }).stepStream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(events.slice(0, 2)).toEqual([{ type: 'reasoning', text: 'Thinking it over.' }, { type: 'text', text: 'Yes.' }]);
  });

  it('numbers tool calls from 0 however many other items come before them', async () => {
    const { client } = fakeClient([
      streamOf([
        { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', summary: [] } },
        { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', call_id: 'a', name: 'weather', arguments: '' } },
        { type: 'response.output_item.added', output_index: 2, item: { type: 'function_call', call_id: 'b', name: 'weather', arguments: '' } },
        { type: 'response.function_call_arguments.delta', output_index: 2, delta: '{"city":"Graz"}' },
        { type: 'response.function_call_arguments.delta', output_index: 1, delta: '{"city":"Vienna"}' },
        completed([]),
      ]),
    ]);
    const events = await collect(createSignal('openai-responses', { apiKey: 'k', client }).stepStream({ messages: [{ role: 'user', content: 'hi' }] }));
    expect(events.filter((event) => (event as { type: string }).type === 'tool_call_delta').map((event) => (event as { index: number }).index)).toEqual([0, 1, 1, 0]);
    expect(events.at(-1)).toMatchObject({ result: { toolCalls: [{ id: 'a', args: { city: 'Vienna' } }, { id: 'b', args: { city: 'Graz' } }] } });
  });

  it('hands the abort signal to the request', async () => {
    const { client, requestOptions } = fakeClient([streamOf([completed([])])]);
    const controller = new AbortController();
    await collect(createSignal('openai-responses', { apiKey: 'k', client }).stepStream({ messages: [{ role: 'user', content: 'hi' }] }, { signal: controller.signal }));
    expect(requestOptions[0]).toEqual({ signal: controller.signal });
  });

  it('an error event ends the stream with a provider error', async () => {
    const { client } = fakeClient([streamOf([{ type: 'error', code: 'rate_limit_exceeded', message: 'Rate limit reached' }])]);
    await expect(collect(createSignal('openai-responses', { apiKey: 'k', client }).stepStream({ messages: [{ role: 'user', content: 'hi' }] })))
      .rejects.toMatchObject({ code: ErrorCode.PROVIDER_ERROR, message: expect.stringContaining('Rate limit reached') });
  });

  it('a failed response ends the stream with a provider error', async () => {
    const { client } = fakeClient([
      streamOf([{ type: 'response.failed', response: { status: 'failed', error: { message: 'server_error' } } }]),
    ]);
    await expect(createSignal('openai-responses', { apiKey: 'k', client }).complete('hi'))
      .rejects.toMatchObject({ code: ErrorCode.PROVIDER_ERROR, message: expect.stringContaining('server_error') });
  });
});

describe('openai-responses — step()', () => {
  it('reads text, tool calls and usage off the output items', async () => {
    const { client, sent } = fakeClient([
      () => ({
        status: 'completed',
        output: [
          { type: 'reasoning', summary: [] },
          { type: 'message', content: [{ type: 'output_text', text: 'Checking.' }] },
          { type: 'function_call', call_id: 'call_9', name: 'lookup', arguments: '{"id":3}' },
        ],
        usage: { input_tokens: 7, output_tokens: 3, total_tokens: 10 },
      }),
    ]);
    const result = await createSignal('openai-responses', { apiKey: 'k', client }).options({ maxTokens: 300, reasoningEffort: 'low' }).step({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'What is this?' }, { type: 'image', source: { type: 'base64', mediaType: 'image/png', data: 'AAAA' } }] }],
      tools: [{ name: 'lookup', description: 'Look up an id.', parameters: { type: 'object', properties: { id: { type: 'number' } } } }],
      toolChoice: { name: 'lookup' },
    });

    expect(result.content).toBe('Checking.');
    expect(result.toolCalls).toEqual([{ id: 'call_9', name: 'lookup', args: { id: 3 } }]);
    expect(result.usage).toMatchObject({ inputTokens: 7, outputTokens: 3, totalTokens: 10 });
    expect(result.finishReason).toBe('tool_calls');
    expect(sent[0]).toMatchObject({
      max_output_tokens: 300,
      reasoning: { effort: 'low' },
      tool_choice: { type: 'function', name: 'lookup' },
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'What is this?' }, { type: 'input_image', image_url: 'data:image/png;base64,AAAA', detail: 'auto' }] }],
    });
  });

  it('replays an assistant turn with text and tool calls as a message followed by its calls', async () => {
    const { client, sent } = fakeClient([() => ({ status: 'completed', output: [] })]);
    await createSignal('openai-responses', { apiKey: 'k', client }).step({
      messages: [
        { role: 'user', content: 'Weather?' },
        { role: 'assistant', content: 'Let me check.', toolCalls: [{ id: 'call_1', name: 'weather', args: '{"city":"Vienna"}' }] },
        { role: 'tool', toolCallId: 'call_1', name: 'weather', content: 'sunny' },
      ],
    });
    expect(sent[0]?.['input']).toEqual([
      { role: 'user', content: 'Weather?' },
      { role: 'assistant', content: 'Let me check.' },
      { type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{"city":"Vienna"}' },
      { type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
    ]);
  });

  it('sends JSON mode as text.format', async () => {
    const { client, sent } = fakeClient([() => ({ status: 'completed', output: [] })]);
    await createSignal('openai-responses', { apiKey: 'k', client }).step({ messages: [{ role: 'user', content: 'hi' }], responseFormat: { type: 'json_object' } });
    expect(sent[0]?.['text']).toEqual({ format: { type: 'json_object' } });
  });

  it('a response cut off at the token budget finishes with length', async () => {
    const { client } = fakeClient([
      () => ({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', content: [{ type: 'output_text', text: 'Once upon' }] }] }),
    ]);
    const result = await createSignal('openai-responses', { apiKey: 'k', client }).step({ messages: [{ role: 'user', content: 'Tell a story.' }] });
    expect(result.content).toBe('Once upon');
    expect(result.finishReason).toBe('length');
  });

  it('a failed response is a provider error', async () => {
    const { client } = fakeClient([() => ({ status: 'failed', error: { message: 'server_error' }, output: [] })]);
    await expect(createSignal('openai-responses', { apiKey: 'k', client }).step({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toMatchObject({ code: ErrorCode.PROVIDER_ERROR, message: expect.stringContaining('server_error') });
  });

  it('refuses stop sequences and a seed before sending anything', async () => {
    const { client, sent } = fakeClient([]);
    const signal = createSignal('openai-responses', { apiKey: 'k', client });
    await expect(signal.options({ stopSequences: ['END'] }).step({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, message: expect.stringContaining('stopSequences') });
    await expect(signal.options({ seed: 1 }).step({ messages: [{ role: 'user', content: 'hi' }] }))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, message: expect.stringContaining('seed') });
    expect(sent).toEqual([]);
  });
});

describe('openai-responses — native structured output', () => {
  it('sends the schema as text.format', async () => {
    const { client, sent } = fakeClient([
      streamOf([
        { type: 'response.output_text.delta', delta: '{"name":"Ada","age":36}' },
        completed([{ type: 'message', content: [{ type: 'output_text', text: '{"name":"Ada","age":36}' }] }]),
      ]),
    ]);
    const { response } = await createSignal(
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'k', model: 'gpt-4o', adapter: 'openai-responses', capabilities: { nativeJsonSchema: true, nativeJsonMode: true } },
      { client },
    )
      .schema(z.object({ name: z.string(), age: z.number() }))
      .complete('Ada is 36.');

    expect(response).toEqual({ name: 'Ada', age: 36 });
    expect(sent[0]?.['text']).toEqual({ format: expect.objectContaining({ type: 'json_schema', name: 'output', strict: false, schema: expect.any(Object) }) });
  });
});
