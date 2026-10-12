import { DEFAULT_TOKEN_KEY, DocumentSnapshotSchema, SNAPSHOT_ELEMENT_ID, heldCookieName } from '../protocol';
import type { DocumentSnapshot } from '../protocol';

export type WireTokenStore = {
  load: () => string | null;
  save: (token: string) => void;
  clear: () => void;
  // Whether the browser itself holds the session, in a cookie the page cannot read.
  held?: () => boolean;
  key?: string;
};

export type WireEnv = {
  tokens: WireTokenStore;
  // `offered` are the subprotocols to construct it with: they say who the terminal is.
  socket: (upgrade: { url: string; offered: string[] }) => WebSocket;
  defaultUrl: () => string;
};

const browserTokens = (tokenKey: string, named: boolean): WireTokenStore => ({
  load: () => {
    try {
      return window.localStorage.getItem(tokenKey);
    } catch {
      return null;
    }
  },
  save: (token) => {
    try {
      window.localStorage.setItem(tokenKey, token);
    } catch {
      // Storage is unavailable: the session lives for this page only.
    }
  },
  clear: () => {
    try {
      window.localStorage.removeItem(tokenKey);
    } catch {
      // No storage, so nothing was stored.
    }
    try {
      document.cookie = `${encodeURIComponent(tokenKey)}=; Path=/; Max-Age=0; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      // No document, or cookies refused.
    }
  },
  held: () => {
    try {
      return document.cookie.split('; ').includes(`${heldCookieName(tokenKey, window.location.port)}=1`);
    } catch {
      return false;
    }
  },
  ...(named ? { key: tokenKey } : {}),
});

// `cookie` is accepted and does nothing.
export const browserEnv = (config: { tokenKey?: string; cookie?: boolean } = {}): WireEnv => ({
  tokens: browserTokens(config.tokenKey ?? DEFAULT_TOKEN_KEY, config.tokenKey !== undefined),
  socket: ({ url, offered }) => new WebSocket(url, offered),
  defaultUrl: () => {
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
    return `${scheme}://${window.location.host}/socket`;
  },
});

export const readDocumentSnapshot = (doc: Pick<Document, 'getElementById'> = document): DocumentSnapshot | undefined => {
  try {
    const text = doc.getElementById(SNAPSHOT_ELEMENT_ID)?.textContent;
    if (text === undefined || text === null || text === '') return undefined;
    const read = DocumentSnapshotSchema.safeParse(JSON.parse(text));
    return read.success ? read.data : undefined;
  } catch {
    return undefined;
  }
};
