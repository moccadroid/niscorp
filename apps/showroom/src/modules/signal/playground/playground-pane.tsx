import type { FC } from 'react';
import { ChatView } from '../chat/chat-view';

// ═══════════════════════════════════════════════════════════
// PlaygroundPane — freeform interactive chat. Same ChatView
// as recipes use, but with provider/model unlocked and no
// pre-seeded conversation.
// ═══════════════════════════════════════════════════════════

export const PlaygroundPane: FC = () => (
  <div>
    <div
      style={{
        padding: '24px 40px 0',
        maxWidth: 880,
        margin: '0 auto',
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
        Signal · Playground
      </div>
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          margin: 0,
          marginBottom: 12,
          color: '#111827',
          letterSpacing: -0.3,
        }}
      >
        Playground
      </h1>
      <p style={{ fontSize: 14, color: '#6b7280', marginTop: 0, marginBottom: 0 }}>
        Pick a provider, type a message, get a real response. Configure your API keys in Settings first.
      </p>
    </div>
    <ChatView
      initial={{
        provider: 'openai',
        systemPrompt: 'You are a helpful assistant.',
        allowProviderChange: true,
      }}
    />
  </div>
);
