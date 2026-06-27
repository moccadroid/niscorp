import type { FunctionHandler } from '@niscorp/nova';
import { runAgentStandalone } from '@niscorp/cortex';
import { getShell } from './bridge';
import { buildContext } from './context';
import { makeTools } from './tools';
import { rayAgent } from './agent';
import { createRayLlm } from './llm';
import { getKey, setKey } from './api-key';
import { ensureCurrent, newSession, switchTo, setMessages, sessionList, type ChatMessage } from './sessions';

const messagesOf = (data: Record<string, unknown>): ChatMessage[] =>
  Array.isArray(data['messages']) ? (data['messages'] as ChatMessage[]) : [];

// The agent as a Nova function. The assistant action calls `ray.run` with its
// data (the message transcript so far, including the just-typed user line); this
// builds the live context, runs the standalone Cortex agent (whose tools drive
// the same shell), persists the exchange to the current session, and returns the
// reply text for Nova to write back into the chat.
export const rayRun: FunctionHandler = async (data) => {
  const key = getKey();
  if (key === undefined) return 'No Groq API key set yet — click the 🔑 button to add one.';

  const shell = getShell();
  const messages = messagesOf(data);
  const transcript = messages.map((m) => `${m.role === 'user' ? 'User' : 'Ray'}: ${m.text}`).join('\n');
  const input = `${buildContext(shell)}\n\nConversation:\n${transcript}\n\nRay:`;

  const result = await runAgentStandalone<string>(rayAgent, input, {
    llm: createRayLlm(key),
    tools: makeTools(shell),
  });
  if (!result.ok) throw new Error(result.error.message);

  const current = ensureCurrent();
  setMessages(current.id, [...messages, { role: 'ray', text: result.data }]);
  return result.data;
};

// Mount: hand the chat its current session's messages + the session list.
export const rayLoad: FunctionHandler = async () => {
  const current = ensureCurrent();
  return { messages: current.messages, sessions: sessionList(), currentId: current.id };
};

// Start a fresh session and switch to it.
export const rayNewSession: FunctionHandler = async () => {
  const session = newSession();
  return { messages: session.messages, sessions: sessionList(), currentId: session.id };
};

// Switch to an existing session (id arrives in `$.currentId`, set just before).
export const raySwitchSession: FunctionHandler = async (data) => {
  const id = String(data['currentId'] ?? '');
  const session = switchTo(id);
  return { messages: session.messages, sessions: sessionList(), currentId: session.id };
};

// Tiny key setter — prompts for the Groq key and stores it (browser-only).
export const raySetKey: FunctionHandler = async () => {
  const entered = typeof window !== 'undefined' ? window.prompt('Groq API key (stored in this browser only):') : null;
  if (entered === null || entered.trim() === '') return 'No key entered.';
  setKey(entered.trim());
  return 'Key saved. Ask me anything.';
};
