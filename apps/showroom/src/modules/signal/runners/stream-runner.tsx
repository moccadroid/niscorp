import { type FC } from 'react';
import { isStreamStory, type StreamStory, type RecipePitch } from '../story-types';
import { getKey } from '../settings/api-key-storage';
import { createOpenAIClient } from '../openai-client';

// ═══════════════════════════════════════════════════════════
// StreamRunner — mounts the recipe's Demo component. That
// component owns the whole integration: signal chain, solid
// stream, state, abort, UI. The runner just provides the API
// key (from Settings) and a pre-built OpenAI SDK client (Vite
// bundler workaround) as props.
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };

export const StreamRunner: FC<Props> = ({ story }) => {
  if (!isStreamStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a stream story.</div>;
  }
  return <StreamDemo story={story} key={story.id} />;
};

const StreamDemo: FC<{ story: StreamStory }> = ({ story }) => {
  const { recipe, pitch } = story;
  const apiKey = getKey(recipe.provider);

  if (apiKey === undefined) {
    return (
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '32px 24px' }}>
        {pitch !== undefined && <Pitch pitch={pitch} />}
        <div
          style={{
            padding: '12px 16px',
            marginTop: 16,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderLeft: '4px solid #f59e0b',
            borderRadius: 6,
            fontSize: 13,
            color: '#92400e',
          }}
        >
          No API key for <strong>{recipe.provider}</strong>. Configure it in Settings to run live.
        </div>
      </div>
    );
  }

  const client = createOpenAIClient(recipe.provider, apiKey);
  const Demo = recipe.Demo;

  return (
    <div>
      {pitch !== undefined && <Pitch pitch={pitch} />}
      <Demo apiKey={apiKey} client={client} />
    </div>
  );
};

const Pitch: FC<{ pitch: RecipePitch }> = ({ pitch }) => (
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
      {pitch.headline}
    </div>
    <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.6 }}>{pitch.body}</div>
  </div>
);
