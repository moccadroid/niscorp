import { useState, type FC } from 'react';
import { clearAllKeys, clearKey, loadKeys, saveKey } from './api-key-storage';

// ═══════════════════════════════════════════════════════════
// Settings — manage per-provider API keys for the signal
// playground and recipe runner. Plain localStorage with a
// clear security warning.
// ═══════════════════════════════════════════════════════════

type ProviderInfo = {
  id: string;
  name: string;
  envKey: string;
  signupUrl: string;
};

const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    envKey: 'OPENAI_API_KEY',
    signupUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    envKey: 'OPENROUTER_API_KEY',
    signupUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'groq',
    name: 'Groq',
    envKey: 'GROQ_API_KEY',
    signupUrl: 'https://console.groq.com/keys',
  },
];

export const SettingsPane: FC = () => {
  // Initialize each input with whatever's currently in storage.
  const initialKeys = loadKeys();
  const [values, setValues] = useState<Record<string, string>>({
    openai: initialKeys['openai'] ?? '',
    openrouter: initialKeys['openrouter'] ?? '',
    groq: initialKeys['groq'] ?? '',
  });
  const [savedTick, setSavedTick] = useState<string | undefined>(undefined);

  const setValue = (id: string, value: string): void => {
    setValues((prev) => ({ ...prev, [id]: value }));
  };

  const handleSave = (id: string): void => {
    const value = values[id]?.trim() ?? '';
    if (value.length === 0) {
      clearKey(id);
    } else {
      saveKey(id, value);
    }
    setSavedTick(id);
    setTimeout(() => setSavedTick(undefined), 1500);
  };

  const handleClear = (id: string): void => {
    clearKey(id);
    setValues((prev) => ({ ...prev, [id]: '' }));
  };

  const handleClearAll = (): void => {
    clearAllKeys();
    setValues({ openai: '', openrouter: '', groq: '' });
  };

  const configured = Object.entries(values)
    .filter(([, v]) => v.trim().length > 0)
    .map(([id]) => id);

  return (
    <div
      style={{
        padding: '40px 56px 80px',
        maxWidth: 820,
        margin: '0 auto',
        color: '#24292f',
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#9ca3af',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          marginBottom: 14,
          fontWeight: 600,
        }}
      >
        Signal · Settings
      </div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          margin: 0,
          marginBottom: 24,
          color: '#111827',
          letterSpacing: -0.3,
          borderBottom: '1px solid #e5e7eb',
          paddingBottom: 12,
        }}
      >
        API Keys
      </h1>

      <div
        style={{
          padding: 16,
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderLeft: '3px solid #d97706',
          borderRadius: 6,
          marginBottom: 32,
          fontSize: 13,
          color: '#78350f',
        }}
      >
        <strong style={{ color: '#78350f' }}>Security note.</strong> API keys live in this browser's localStorage as
        plain text. They are sent only to each provider's official API endpoint via the openai SDK that signal loads
        at runtime. Anyone with access to this browser profile can read them. For production deployments, use a
        server-side proxy. Use the <em>Clear all keys</em> button at the bottom to wipe them.
      </div>

      {PROVIDERS.map((p) => {
        const isSaved = savedTick === p.id;
        const isConfigured = (values[p.id]?.trim().length ?? 0) > 0;
        return (
          <div
            key={p.id}
            style={{
              padding: 20,
              background: '#f9fafb',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              marginBottom: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280', fontFamily: 'ui-monospace, Menlo, monospace' }}>
                  {p.envKey}
                </div>
              </div>
              <a
                href={p.signupUrl}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 11, color: '#2563eb', textDecoration: 'none' }}
              >
                Get key →
              </a>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="password"
                value={values[p.id] ?? ''}
                onChange={(e) => setValue(p.id, e.target.value)}
                placeholder={isConfigured ? '••••••••••••••••' : 'sk-...'}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                  fontFamily: 'ui-monospace, Menlo, monospace',
                  background: '#ffffff',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => handleSave(p.id)}
                style={{
                  padding: '8px 16px',
                  background: isSaved ? '#16a34a' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  minWidth: 80,
                }}
              >
                {isSaved ? '✓ Saved' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => handleClear(p.id)}
                style={{
                  padding: '8px 16px',
                  background: '#ffffff',
                  color: '#1f2937',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Clear
              </button>
            </div>
          </div>
        );
      })}

      <div
        style={{
          marginTop: 32,
          padding: 16,
          background: '#f3f4f6',
          borderRadius: 8,
          fontSize: 13,
          color: '#374151',
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Configured providers</div>
        {configured.length === 0 ? (
          <div style={{ color: '#9ca3af' }}>None. Recipes can still run in snapshot mode.</div>
        ) : (
          <div>{configured.join(', ')}</div>
        )}
      </div>

      <div style={{ marginTop: 32, textAlign: 'right' }}>
        <button
          type="button"
          onClick={handleClearAll}
          style={{
            padding: '10px 18px',
            background: '#dc2626',
            color: '#ffffff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Clear all keys
        </button>
      </div>
    </div>
  );
};
