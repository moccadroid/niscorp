import type { Message } from '@niscorp/signal';
import type { ToolDefinition } from '../tool/define-tool';

export type RunInput = string | Message[] | unknown;

export type AgentInfo = {
  id: string;
  description?: string;
};

export type ProducerArgs<TDeps> = {
  deps: TDeps;
  input: RunInput;
  agent: AgentInfo;
};

export type ContextEntry = string | string[] | Message[];

export type Producer<TDeps = undefined> = (
  args: ProducerArgs<TDeps>,
) => ContextEntry | Promise<ContextEntry>;

const isMessageArray = (value: unknown): value is Message[] =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      'role' in item &&
      typeof (item as { role: unknown }).role === 'string',
  );

export const inputMessages = (input: RunInput): Message[] => {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (isMessageArray(input)) return input;
  return [{ role: 'user', content: JSON.stringify(input) }];
};

const entryMessages = (entry: ContextEntry): Message[] => {
  if (typeof entry === 'string') {
    return entry.length > 0 ? [{ role: 'system', content: entry }] : [];
  }
  if (isMessageArray(entry)) return entry;
  return entry
    .filter((chunk): chunk is string => typeof chunk === 'string' && chunk.length > 0)
    .map((chunk): Message => ({ role: 'system', content: chunk }));
};

export const assembleContext = async <TDeps>(
  items: ReadonlyArray<ContextEntry | Producer<TDeps>>,
  args: ProducerArgs<TDeps>,
): Promise<Message[]> => {
  const messages: Message[] = [];
  for (const item of items) {
    const entry = typeof item === 'function' ? await item(args) : item;
    messages.push(...entryMessages(entry));
  }
  return messages;
};

export const toolGuidesMessage = (tools: ReadonlyArray<ToolDefinition>): Message[] => {
  const guides = tools
    .map((tool) => {
      const guide = tool.config.guide;
      const produced = typeof guide === 'function' ? guide() : guide;
      const text = Array.isArray(produced) ? produced.join('\n') : produced;
      return text !== undefined && text.length > 0 ? `── ${tool.config.name} ──\n${text}` : undefined;
    })
    .filter((section): section is string => section !== undefined);
  if (guides.length === 0) return [];
  return [
    {
      role: 'system',
      content: `TOOL GUIDES — how to use the tools on this run:\n\n${guides.join('\n\n')}`,
    },
  ];
};

export const estimateTokens = (messages: ReadonlyArray<Message>): number => {
  let total = 0;
  for (const message of messages) {
    total += 4;
    if (typeof message.content === 'string') {
      total += Math.ceil(message.content.length / 4);
      continue;
    }
    for (const part of message.content) {
      total += part.type === 'text' ? Math.ceil(part.text.length / 4) : 256;
    }
  }
  return total;
};
