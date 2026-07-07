// Chat sessions — persisted in localStorage so history survives closing the
// panel, with a current session and a switchable list. Browser-only (v1).
import type { TraceStep } from './trace';
import { lsGet, lsSet, lsRemove } from '../storage';

// A chat line. Ray messages also carry their tool-call trace + total duration, so
// the trace survives closing and reopening the panel — always saved; the debug
// toggle only governs whether the JSON detail is shown.
export type ChatMessage = { role: string; text: string; trace?: TraceStep[]; ms?: number; view?: unknown };
export type Session = { id: string; title: string; messages: ChatMessage[]; createdAt: number };

const SESSIONS_KEY = 'relay.ray.sessions';
const CURRENT_KEY = 'relay.ray.current';

const read = (): Session[] => {
  try {
    const raw = lsGet(SESSIONS_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
};

const write = (sessions: Session[]): void => lsSet(SESSIONS_KEY, JSON.stringify(sessions));

const newId = (): string => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const titleOf = (messages: ChatMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser === undefined) return 'New chat';
  return firstUser.text.length > 40 ? `${firstUser.text.slice(0, 40)}…` : firstUser.text;
};

const create = (): Session => {
  const session: Session = { id: newId(), title: 'New chat', messages: [], createdAt: Date.now() };
  write([session, ...read()]);
  lsSet(CURRENT_KEY, session.id);
  return session;
};

// The current session — create one if none exists or the stored id is stale.
export const ensureCurrent = (): Session => {
  const found = read().find((s) => s.id === lsGet(CURRENT_KEY));
  return found ?? create();
};

export const newSession = (): Session => create();

export const switchTo = (id: string): Session => {
  const found = read().find((s) => s.id === id);
  if (found === undefined) return ensureCurrent();
  lsSet(CURRENT_KEY, id);
  return found;
};

// Replace a session's messages (and refresh its title from the first user line).
export const setMessages = (id: string, messages: ChatMessage[]): void => {
  const sessions = read();
  const idx = sessions.findIndex((s) => s.id === id);
  if (idx < 0) return;
  sessions[idx] = { ...sessions[idx]!, messages, title: titleOf(messages) };
  write(sessions);
};

// Lightweight list for the picker — newest first.
export const sessionList = (): { id: string; title: string }[] =>
  read()
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => ({ id: s.id, title: s.title }));

// Wipe every Ray session (and the current pointer). The chat opens empty next.
export const clearAll = (): void => {
  lsRemove(SESSIONS_KEY);
  lsRemove(CURRENT_KEY);
};

// Rough byte estimate of everything Ray keeps in localStorage (sessions, key,
// debug flag — sessions dominate). UTF-16 chars ≈ 2 bytes; "roughly" is the
// point. Formatted as B / KB / MB.
export const storageEstimate = (): string => {
  let bytes = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k === null || !k.startsWith('relay.ray.')) continue;
      bytes += ((window.localStorage.getItem(k) ?? '').length + k.length) * 2;
    }
  } catch {
    return '—';
  }
  if (bytes < 1024) return `~${bytes} B`;
  if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
  return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
