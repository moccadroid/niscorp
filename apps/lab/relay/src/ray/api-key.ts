// Groq API key — held in localStorage (browser-only, as agreed for v1). Plain
// text, visible to anyone with the browser. Sent only to Groq's API via the
// OpenAI-compatible SDK. We host this properly later.
const STORAGE_KEY = 'relay.ray.groq-key';

export const getKey = (): string | undefined => {
  try {
    const k = window.localStorage.getItem(STORAGE_KEY);
    return k === null || k === '' ? undefined : k;
  } catch {
    return undefined;
  }
};

export const setKey = (key: string): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
};
