// ═══════════════════════════════════════════════════════════
// Context assembly — ENTRIES enter, PRODUCERS make them
// ═══════════════════════════════════════════════════════════
//
// Per DESIGN.md §5. Two words, two types: a ContextEntry is what enters
// the prefix (a string chunk, several chunks, or raw messages); a
// Producer is a FUNCTION that makes one. How a producer constructs its
// entry is irrelevant — a library export (vexGuide), an app's ambient
// fact ("today is …"), a registry render — same contract. Annotate
// definitions with `satisfies Producer` so what a thing is stays
// obvious at the definition site. Order in the array IS placement (no
// priorities). Producers run ONCE, at run start; the transcript is
// append-only afterwards — dynamic steering belongs to prepareStep.
// Tools contribute their own guides through a separate section (below):
// a tool's usage knowledge travels with the tool, never hand-copied
// into instructions.

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

// What enters context: one system chunk, several (each string becomes its
// own system message — a producer can emit a GROUP), or raw messages.
export type ContextEntry = string | string[] | Message[];

// What makes one. Always a function — the name says so.
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

// The user turn(s) for a run input. Strings become one user message;
// Message[] passes through (caller-owned multi-turn history); any
// other value is minified JSON in a user message.
export const inputMessages = (input: RunInput): Message[] => {
  if (typeof input === 'string') return [{ role: 'user', content: input }];
  if (isMessageArray(input)) return input;
  return [{ role: 'user', content: JSON.stringify(input) }];
};

// Normalize one entry into messages: string → one system chunk (empty
// skipped); string[] → one system chunk PER string; Message[] → passthrough.
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

// One system chunk built from the ACTIVE tools' own guides — the tool-owned
// half of the producer principle. A tool that defines `guide` teaches every
// run that carries it; agents never restate tool usage in instructions.
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

// Rough token estimate for previews and budget conditions:
// ~4 chars per token plus a small per-message overhead.
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
