import { useEffect, useRef, useState, type FC, type ReactNode } from 'react';
import { z } from 'zod';
import { createSignal, type Message, type SignalResult, type Tool, type SignalOptions } from '@niscorp/signal';
import { getKey } from '../settings/api-key-storage';
import { createOpenAIClient } from '../openai-client';
import { useSignalSetter } from '../runtime-context';
import type { RecipeProvider, StructuredRender } from '../story-types';
import { JsonViewer } from './json-viewer';
import { CardRenderer, isCardData } from './card-renderer';

// ═══════════════════════════════════════════════════════════
// ChatView — the reusable conversation surface that powers
// both the standalone Playground page and every recipe demo.
//
// Same UX everywhere: a thread of user/assistant turns, a
// compose box, a Send button. Whatever recipe state was
// passed in (system prompt, history, tools, schema) goes
// straight into the signal call so the conversation continues
// from the recipe's starting point.
//
// Snapshotted assistant turns are tagged with `__snapshot:
// true` so the UI can render a small badge on them.
// ═══════════════════════════════════════════════════════════

const PROVIDER_DEFAULT_MODEL: Record<RecipeProvider, string> = {
  openai: 'gpt-4o-mini',
  openrouter: 'openai/gpt-4o-mini',
  groq: 'openai/gpt-oss-120b',
};

// Conversation entries are messages plus a synthetic "snapshot"
// flag for any turns that came from a pre-recorded snapshot
// rather than a real API call.
export type ChatMessage = Message & {
  __snapshot?: boolean;
  // When the assistant returned a structured (object) response from a
  // schema-constrained call, the parsed object is stashed here so the
  // bubble can render it via JsonViewer / CardRenderer instead of text.
  __structured?: unknown;
};

export type ChatViewInitial = {
  provider: RecipeProvider;
  model?: string;
  systemPrompt?: string;
  history?: Message[];
  tools?: Tool[];
  schema?: z.ZodTypeAny;
  options?: SignalOptions;
  // Pre-filled compose box content (used when there's no snapshot — recipes
  // typed an example input the user can edit and send).
  initialInput?: string;
  // True when the user can change provider/model on the fly. Recipes lock
  // these to whatever the recipe declared; the standalone playground unlocks.
  allowProviderChange?: boolean;
  // How to render structured assistant responses (object .response).
  structuredRender?: StructuredRender;
  // If the seeded snapshot's final assistant message was a structured
  // (object) response, the parsed object goes here so the bubble can
  // render it with JsonViewer / CardRenderer instead of stringified JSON.
  seededStructuredFinal?: unknown;
  // Recipe mode: when provided, Send calls this function instead of
  // building a signal chain inline. This is the `recipe.complete`
  // from a RecipeModule — what you see in the Source tab is what runs.
  // When absent, chat-view falls back to playground mode: it builds
  // its own chain from provider/model/systemPrompt/tools/schema/options.
  complete?: (
    apiKey: string,
    input: string,
    history?: Message[],
    client?: unknown,
  ) => Promise<SignalResult<unknown>>;
};

type Props = {
  initial: ChatViewInitial;
  // Called whenever a new live response lands. Used by the recipe runner
  // to publish meta into the inspector.
  onResult?: (result: SignalResult<unknown>) => void;
};

const ROLE_BG: Record<string, string> = {
  user: '#eff6ff',
  assistant: '#f0fdf4',
  system: '#f3f4f6',
  tool: '#fef3c7',
};
const ROLE_BORDER: Record<string, string> = {
  user: '#bfdbfe',
  assistant: '#bbf7d0',
  system: '#d1d5db',
  tool: '#fde68a',
};
const ROLE_ACCENT: Record<string, string> = {
  user: '#2563eb',
  assistant: '#16a34a',
  system: '#6b7280',
  tool: '#d97706',
};
const ROLE_LABEL_COLOR: Record<string, string> = {
  user: '#1e40af',
  assistant: '#166534',
  system: '#374151',
  tool: '#854d0e',
};

const stringifyContent = (content: Message['content']): string => {
  if (typeof content === 'string') return content;
  return content
    .map((part) => (part.type === 'text' ? part.text : '[image]'))
    .join('\n');
};

const Bubble: FC<{ message: ChatMessage; structuredRender?: StructuredRender }> = ({ message, structuredRender }) => {
  const role = message.role;
  const bg = ROLE_BG[role] ?? '#f9fafb';
  const border = ROLE_BORDER[role] ?? '#e5e7eb';
  const accent = ROLE_ACCENT[role] ?? '#9ca3af';
  const labelColor = ROLE_LABEL_COLOR[role] ?? '#6b7280';
  const isSnapshot = message.__snapshot === true;

  // Tool result rows have a different shape — toolCallId + name.
  if (role === 'tool') {
    return (
      <div
        style={{
          marginBottom: 12,
          padding: '10px 14px',
          background: bg,
          border: `1px solid ${border}`,
          borderLeft: `3px solid ${accent}`,
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: labelColor, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>TOOL · {message.name}</span>
          {isSnapshot && <SnapshotBadge />}
        </div>
        <pre style={{ margin: 0, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {message.content}
        </pre>
      </div>
    );
  }

  return (
    <div
      style={{
        marginBottom: 12,
        padding: '10px 14px',
        background: bg,
        border: `1px solid ${border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 6,
        fontSize: 13,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: labelColor, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{role.toUpperCase()}</span>
        {isSnapshot && <SnapshotBadge />}
      </div>
      {message.__structured !== undefined && role === 'assistant' ? (
        <StructuredBody value={message.__structured} render={structuredRender} />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {stringifyContent(message.content)}
        </div>
      )}
    </div>
  );
};

const StructuredBody: FC<{ value: unknown; render?: StructuredRender }> = ({ value, render }) => {
  if (render === 'card' && isCardData(value)) {
    return (
      <div style={{ marginTop: 4 }}>
        <CardRenderer card={value} />
      </div>
    );
  }
  return (
    <div style={{ marginTop: 4 }}>
      <JsonViewer value={value} />
    </div>
  );
};

const SnapshotBadge: FC = () => (
  <span
    style={{
      fontSize: 9,
      fontWeight: 700,
      padding: '2px 6px',
      background: '#fef3c7',
      color: '#854d0e',
      border: '1px solid #fde68a',
      borderRadius: 3,
      letterSpacing: 0.3,
    }}
  >
    SNAPSHOT
  </span>
);

export const ChatView: FC<Props> = ({ initial, onResult }) => {
  const setView = useSignalSetter();

  const [provider, setProvider] = useState<RecipeProvider>(initial.provider);
  const [model, setModel] = useState<string>(initial.model ?? PROVIDER_DEFAULT_MODEL[initial.provider]);
  const [systemPrompt, setSystemPrompt] = useState<string>(initial.systemPrompt ?? '');
  const [conversation, setConversation] = useState<ChatMessage[]>([]);
  const [composeText, setComposeText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const allowProviderChange = initial.allowProviderChange ?? false;

  // On story / initial change, reseed the chat from scratch.
  useEffect(() => {
    setProvider(initial.provider);
    setModel(initial.model ?? PROVIDER_DEFAULT_MODEL[initial.provider]);
    setSystemPrompt(initial.systemPrompt ?? '');
    const seeded: ChatMessage[] = (initial.history ?? []).map((m) => ({ ...m, __snapshot: true }));
    // Tag the final assistant message with the parsed structured response,
    // if there is one, so it renders as JsonViewer / Card instead of text.
    if (initial.seededStructuredFinal !== undefined) {
      for (let i = seeded.length - 1; i >= 0; i--) {
        const m = seeded[i];
        if (m !== undefined && m.role === 'assistant') {
          seeded[i] = Object.assign({}, m, { __structured: initial.seededStructuredFinal });
          break;
        }
      }
    }
    setConversation(seeded);
    setComposeText(initial.initialInput ?? '');
    setError(undefined);
    setLoading(false);
  }, [initial]);

  // Publish the latest live result + loading state to the inspector tabs.
  // We don't publish anything for snapshot-only state — the inspector
  // displays setup info and the most recent live response only.
  const lastResultRef = useRef<SignalResult<unknown> | undefined>(undefined);
  useEffect(() => {
    setView({
      mode: 'live',
      loading,
      result: lastResultRef.current,
      error,
    });
  }, [loading, error, setView]);

  const handleProviderChange = (next: RecipeProvider): void => {
    setProvider(next);
    setModel(PROVIDER_DEFAULT_MODEL[next]);
  };

  const handleSend = (): void => {
    const text = composeText.trim();
    if (text.length === 0) return;
    const key = getKey(provider);
    if (key === undefined) {
      setError(`No API key configured for ${provider}. Configure it in Settings.`);
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: text };
    const nextConversation: ChatMessage[] = [...conversation, userMessage];
    setConversation(nextConversation);
    setComposeText('');
    setLoading(true);
    setError(undefined);

    // Strip the synthetic __snapshot field before sending to signal.
    const historyForApi: Message[] = conversation.map((m) => {
      const copy: Message = { ...m };
      return copy;
    });

    const client = createOpenAIClient(provider, key);

    // Recipe mode: invoke the authored recipe function. Its file IS
    // the code that runs — nothing is duplicated here.
    // Playground mode: build the chain inline from form state.
    const callPromise: Promise<SignalResult<unknown>> =
      initial.complete !== undefined
        ? initial.complete(key, text, historyForApi, client)
        : (() => {
            const base = createSignal(provider, { client })
              .apiKey(key)
              .model(model)
              .history(historyForApi);
            const withPrompt = systemPrompt.length > 0 ? base.systemPrompt(systemPrompt) : base;
            const withTools = initial.tools !== undefined ? withPrompt.tools(initial.tools) : withPrompt;
            const withOptions = initial.options !== undefined ? withTools.options(initial.options) : withTools;
            const finalSignal = initial.schema !== undefined ? withOptions.schema(initial.schema) : withOptions;
            return (finalSignal as { complete: (input: string) => Promise<SignalResult<unknown>> })
              .complete(text);
          })();

    callPromise
      .then((result: SignalResult<unknown>) => {
        lastResultRef.current = result;
        const isStructured = typeof result.response === 'object' && result.response !== null;
        const assistantMessage: ChatMessage = isStructured
          ? {
              role: 'assistant',
              content: JSON.stringify(result.response),
              __structured: result.response,
            }
          : { role: 'assistant', content: String(result.response ?? '') };
        setConversation((prev) => [...prev, assistantMessage]);
        setLoading(false);
        if (onResult !== undefined) onResult(result);
        setView({ mode: 'live', loading: false, result, error: undefined });
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setLoading(false);
        // Roll back the user message so the user can edit and retry.
        setConversation((prev) => prev.slice(0, prev.length - 1));
        setComposeText(text);
      });
  };

  const handleClear = (): void => {
    // Reset the conversation to the seeded initial state (snapshot if any).
    const seeded: ChatMessage[] = (initial.history ?? []).map((m) => ({ ...m, __snapshot: true }));
    if (initial.seededStructuredFinal !== undefined) {
      for (let i = seeded.length - 1; i >= 0; i--) {
        const m = seeded[i];
        if (m !== undefined && m.role === 'assistant') {
          seeded[i] = Object.assign({}, m, { __structured: initial.seededStructuredFinal });
          break;
        }
      }
    }
    setConversation(seeded);
    setError(undefined);
    setComposeText(initial.initialInput ?? '');
    lastResultRef.current = undefined;
  };

  const hasKey = getKey(provider) !== undefined;

  return (
    <div
      style={{
        padding: '32px 40px 80px',
        maxWidth: 880,
        margin: '0 auto',
        color: '#24292f',
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {/* Provider + model row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label="Provider">
          {allowProviderChange ? (
            <select
              value={provider}
              onChange={(e) => {
                const value = e.target.value;
                if (value === 'openai' || value === 'openrouter' || value === 'groq') {
                  handleProviderChange(value);
                }
              }}
              style={selectStyle}
            >
              <option value="openai">openai</option>
              <option value="openrouter">openrouter</option>
              <option value="groq">groq</option>
            </select>
          ) : (
            <Locked>{provider}</Locked>
          )}
        </Field>
        <Field label="Model" grow>
          {allowProviderChange ? (
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{ ...inputStyle, fontFamily: 'ui-monospace, Menlo, monospace' }}
            />
          ) : (
            <Locked>{model}</Locked>
          )}
        </Field>
      </div>

      {/* System prompt — shown only if it exists or if user can edit it */}
      {(systemPrompt.length > 0 || allowProviderChange) && (
        <div style={{ marginBottom: 16 }}>
          <Field label="System prompt">
            {allowProviderChange ? (
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
              />
            ) : (
              <Locked block>{systemPrompt}</Locked>
            )}
          </Field>
        </div>
      )}

      {/* Conversation thread */}
      <div
        style={{
          minHeight: 240,
          maxHeight: 520,
          overflow: 'auto',
          padding: 14,
          background: '#f9fafb',
          border: '1px solid #e5e7eb',
          borderRadius: 10,
          marginBottom: 12,
        }}
      >
        {conversation.length === 0 ? (
          <div style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: 32 }}>
            No messages yet. {composeText.length > 0 ? 'Hit Send to see a real response.' : 'Type something below and hit Send.'}
          </div>
        ) : (
          conversation.map((msg, i) => <Bubble key={`msg-${i}`} message={msg} structuredRender={initial.structuredRender} />)
        )}
        {loading && (
          <div style={{ padding: '10px 14px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderLeft: '3px solid #16a34a', borderRadius: 6, fontSize: 12, fontStyle: 'italic', color: '#166534' }}>
            ASSISTANT typing...
          </div>
        )}
      </div>

      {/* Error */}
      {error !== undefined && (
        <div style={{ marginBottom: 12, padding: 12, background: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', borderLeft: '3px solid #dc2626', borderRadius: 6, fontSize: 12 }}>
          {error}
        </div>
      )}

      {/* Compose */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={composeText}
          onChange={(e) => setComposeText(e.target.value)}
          placeholder={hasKey ? 'Type a message... (Cmd/Ctrl + Enter to send)' : `No API key for ${provider}. Configure in Settings.`}
          rows={3}
          disabled={!hasKey || loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
          style={{
            flex: 1,
            padding: '10px 14px',
            border: '1px solid #d1d5db',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            background: hasKey ? '#ffffff' : '#f9fafb',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasKey || loading || composeText.trim().length === 0}
          style={{
            padding: '12px 24px',
            background: hasKey && !loading && composeText.trim().length > 0 ? '#2563eb' : '#9ca3af',
            color: '#ffffff',
            border: 'none',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 700,
            cursor: hasKey && !loading && composeText.trim().length > 0 ? 'pointer' : 'not-allowed',
            minWidth: 88,
            alignSelf: 'flex-end',
          }}
        >
          {loading ? '...' : 'Send'}
        </button>
      </div>

      {conversation.length > 0 && (
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <button
            type="button"
            onClick={handleClear}
            style={{
              padding: '6px 12px',
              background: 'transparent',
              color: '#6b7280',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
};

// ─── styled helpers ────────────────────────────────────────

const selectStyle = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  background: '#ffffff',
  outline: 'none',
} as const;

const inputStyle = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  background: '#ffffff',
  outline: 'none',
} as const;

const Field: FC<{ label: string; grow?: boolean; children: ReactNode }> = ({ label, grow, children }) => (
  <div style={grow === true ? { flex: 1, minWidth: 200 } : undefined}>
    <label
      style={{
        display: 'block',
        fontSize: 10,
        fontWeight: 700,
        color: '#6b7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
      }}
    >
      {label}
    </label>
    {children}
  </div>
);

const Locked: FC<{ children: ReactNode; block?: boolean }> = ({ children, block }) => (
  <div
    style={{
      padding: '8px 12px',
      background: '#f3f4f6',
      border: '1px solid #e5e7eb',
      borderRadius: 6,
      fontSize: 13,
      fontFamily: 'ui-monospace, Menlo, monospace',
      color: '#1f2937',
      whiteSpace: block === true ? 'pre-wrap' : 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    }}
  >
    {children}
  </div>
);
