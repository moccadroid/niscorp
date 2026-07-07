// Browser localStorage, guarded — every access is wrapped so a disabled or full
// store degrades to a no-op (reads → null) instead of throwing. Used by anything
// that persists browser-local state: the Groq key, Ray's debug flag, Ray sessions.
export const lsGet = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const lsSet = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

export const lsRemove = (key: string): void => {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
};
