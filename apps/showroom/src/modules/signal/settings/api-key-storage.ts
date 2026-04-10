// ═══════════════════════════════════════════════════════════
// API key storage — per-provider keys held in localStorage.
// Plain text. Visible to anyone with browser access. The
// settings UI shows a clear warning. Keys are sent ONLY to
// each provider's official API endpoint via the openai SDK
// signal loads dynamically.
// ═══════════════════════════════════════════════════════════

const STORAGE_KEY = 'showroom-signal-keys';

type StoredKeys = Record<string, string>;

const isStoredKeys = (value: unknown): value is StoredKeys => {
  if (value === null || typeof value !== 'object') return false;
  for (const key of Object.keys(value)) {
    if (typeof Reflect.get(value, key) !== 'string') return false;
  }
  return true;
};

export const loadKeys = (): StoredKeys => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredKeys(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
};

const writeKeys = (keys: StoredKeys): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
};

export const saveKey = (provider: string, key: string): void => {
  const current = loadKeys();
  current[provider] = key;
  writeKeys(current);
};

export const clearKey = (provider: string): void => {
  const current = loadKeys();
  delete current[provider];
  writeKeys(current);
};

export const clearAllKeys = (): void => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
};

export const getKey = (provider: string): string | undefined => {
  const keys = loadKeys();
  return keys[provider];
};
