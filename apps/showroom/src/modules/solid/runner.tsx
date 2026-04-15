import { type FC, useState } from 'react';
import type { ValidationMode } from '@niscorp/solid';
import { isStreamDemoStory, type StreamDemoStory } from './story-types';

// ═══════════════════════════════════════════════════════════
// Solid runner. Mounts the recipe's authored `Demo` component
// and provides two bits of chrome: a pitch callout above, and
// (when the story opts in) a `trust / recover / strict` mode
// switcher that re-mounts the Demo with a different prop. The
// entire demo — createStream, .on, .write, rendering — lives in
// the recipe file.
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };

export const Runner: FC<Props> = ({ story }) => {
  if (!isStreamDemoStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a stream demo story.</div>;
  }
  return <SolidDemo story={story} key={story.id} />;
};

const SolidDemo: FC<{ story: StreamDemoStory }> = ({ story }) => {
  const [mode, setMode] = useState<ValidationMode>('recover');
  const Demo = story.recipe.Demo;

  return (
    <div>
      {story.pitch !== undefined && <Pitch headline={story.pitch.headline} body={story.pitch.body} />}
      {story.showModeSwitcher === true && <ModeSelector mode={mode} onChange={setMode} />}
      <Demo key={mode} mode={mode} />
    </div>
  );
};

// ─── Pitch chrome ──────────────────────────────────────────

const Pitch: FC<{ headline: string; body: string }> = ({ headline, body }) => (
  <div
    style={{
      maxWidth: 880,
      margin: '24px auto 0',
      padding: '20px 24px',
      background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
      border: '1px solid #dbeafe',
      borderLeft: '4px solid #2563eb',
      borderRadius: 10,
    }}
  >
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
      }}
    >
      Why this matters
    </div>
    <div
      style={{
        fontSize: 16,
        fontWeight: 700,
        color: '#111827',
        marginBottom: 6,
        letterSpacing: -0.2,
      }}
    >
      {headline}
    </div>
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{body}</div>
  </div>
);

// ─── Mode selector (remounts Demo on change) ───────────────

const MODE_TINT: Record<ValidationMode, string> = {
  trust: '#9ca3af',
  recover: '#2563eb',
  strict: '#dc2626',
};

const MODE_LABEL: Record<ValidationMode, string> = {
  trust: 'trust',
  recover: 'recover',
  strict: 'strict',
};

const ModeSelector: FC<{ mode: ValidationMode; onChange: (m: ValidationMode) => void }> = ({
  mode,
  onChange,
}) => (
  <div
    style={{
      maxWidth: 960,
      margin: '16px auto 0',
      padding: '0 24px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}
  >
    <div style={{ fontSize: 12, color: '#6b7280' }}>ValidationMode</div>
    <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 6, padding: 2 }}>
      {(['trust', 'recover', 'strict'] as const).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            padding: '4px 12px',
            borderRadius: 4,
            border: 'none',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            background: mode === key ? '#ffffff' : 'transparent',
            color: mode === key ? MODE_TINT[key] : '#6b7280',
            boxShadow: mode === key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
          }}
        >
          {MODE_LABEL[key]}
        </button>
      ))}
    </div>
  </div>
);
