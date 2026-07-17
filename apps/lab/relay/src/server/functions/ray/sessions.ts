import type { TraceStep } from './trace';

// Chat sessions — server-side, per principal, in memory: history survives
// closing the panel and reconnecting (the store lives with the process),
// and one principal's chats are invisible to another. Durable storage is
// a later story; eviction dies with the process.
export type ChatMessage = { role: string; text: string; trace?: TraceStep[]; ms?: number; view?: unknown };
export type Session = { id: string; title: string; messages: ChatMessage[]; createdAt: number };

type Store = { sessions: Session[]; currentId: string | null; debug: boolean };

const stores = new Map<string, Store>();

const storeOf = (principal: string): Store => {
  const hit = stores.get(principal);
  if (hit !== undefined) return hit;
  const fresh: Store = { sessions: [], currentId: null, debug: false };
  stores.set(principal, fresh);
  return fresh;
};

const newId = (): string => `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const titleOf = (messages: ChatMessage[]): string => {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser === undefined) return 'New chat';
  return firstUser.text.length > 40 ? `${firstUser.text.slice(0, 40)}…` : firstUser.text;
};

// One principal's session surface — everything Ray's fns need, bound once.
export type SessionStore = {
  ensureCurrent: () => Session;
  newSession: () => Session;
  switchTo: (id: string) => Session;
  setMessages: (id: string, messages: ChatMessage[]) => void;
  sessionList: () => { id: string; title: string }[];
  clear: () => void;
  // rough byte estimate of this principal's chat history (JSON length)
  estimate: () => string;
  getDebug: () => boolean;
  setDebug: (on: boolean) => void;
};

export const sessionStore = (principal: string): SessionStore => {
  const store = storeOf(principal);

  const create = (): Session => {
    const session: Session = { id: newId(), title: 'New chat', messages: [], createdAt: Date.now() };
    store.sessions.unshift(session);
    store.currentId = session.id;
    return session;
  };

  return {
    ensureCurrent: () => store.sessions.find((s) => s.id === store.currentId) ?? create(),
    newSession: () => create(),
    switchTo: (id) => {
      const found = store.sessions.find((s) => s.id === id);
      if (found === undefined) return store.sessions.find((s) => s.id === store.currentId) ?? create();
      store.currentId = id;
      return found;
    },
    setMessages: (id, messages) => {
      const session = store.sessions.find((s) => s.id === id);
      if (session === undefined) return;
      session.messages = messages;
      session.title = titleOf(messages);
    },
    sessionList: () =>
      store.sessions
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((s) => ({ id: s.id, title: s.title })),
    clear: () => {
      store.sessions = [];
      store.currentId = null;
    },
    estimate: () => {
      const bytes = JSON.stringify(store.sessions).length;
      if (bytes < 1024) return `~${bytes} B`;
      if (bytes < 1024 * 1024) return `~${(bytes / 1024).toFixed(1)} KB`;
      return `~${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    },
    getDebug: () => store.debug,
    setDebug: (on) => {
      store.debug = on;
    },
  };
};
