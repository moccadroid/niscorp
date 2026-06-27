// Chat sessions — persisted in localStorage so history survives closing the
// panel, with a current session and a switchable list. Browser-only (v1).
export type ChatMessage = { role: string; text: string };
export type Session = { id: string; title: string; messages: ChatMessage[]; createdAt: number };

const SESSIONS_KEY = 'relay.ray.sessions';
const CURRENT_KEY = 'relay.ray.current';

const read = (): Session[] => {
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Session[]) : [];
  } catch {
    return [];
  }
};

const write = (sessions: Session[]): void => {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
  } catch {
    /* ignore */
  }
};

const newId = (): string => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const titleOf = (messages: ChatMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser === undefined) return 'New chat';
  return firstUser.text.length > 40 ? `${firstUser.text.slice(0, 40)}…` : firstUser.text;
};

const create = (): Session => {
  const session: Session = { id: newId(), title: 'New chat', messages: [], createdAt: Date.now() };
  write([session, ...read()]);
  try {
    window.localStorage.setItem(CURRENT_KEY, session.id);
  } catch {
    /* ignore */
  }
  return session;
};

// The current session — create one if none exists or the stored id is stale.
export const ensureCurrent = (): Session => {
  const sessions = read();
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(CURRENT_KEY);
  } catch {
    id = null;
  }
  const found = sessions.find((s) => s.id === id);
  return found ?? create();
};

export const newSession = (): Session => create();

export const switchTo = (id: string): Session => {
  const found = read().find((s) => s.id === id);
  if (found === undefined) return ensureCurrent();
  try {
    window.localStorage.setItem(CURRENT_KEY, id);
  } catch {
    /* ignore */
  }
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
