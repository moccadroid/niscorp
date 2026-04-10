import type { FC } from 'react';
import type { Message } from '@niscorp/signal';
import { isRecipeStory, type RecipeStory, type RecipePitch } from '../story-types';
import { ChatView, type ChatViewInitial } from '../chat/chat-view';

// ═══════════════════════════════════════════════════════════
// RecipeRunner — drops the user into a chat that's already
// pre-loaded with the recipe's setup. If the recipe ships a
// snapshot, the snapshot's history shows up as the starting
// turns of the conversation, tagged with a SNAPSHOT badge so
// the user knows those turns are illustrative. Sending a
// message makes a real call against the recipe's provider —
// same as the playground.
// ═══════════════════════════════════════════════════════════

type Props = { story: unknown };

const buildInitial = (story: RecipeStory): ChatViewInitial => {
  const seededHistory: Message[] = story.snapshot?.result.history ?? story.setup.history ?? [];
  const initialInput = story.snapshot === undefined ? story.setup.input : '';

  // If the snapshot's response was a structured (object) result, hand the
  // parsed object to ChatView so the seeded final assistant message renders
  // as JsonViewer / Card instead of stringified JSON in a text bubble.
  const snapshotResponse = story.snapshot?.result.response;
  const seededStructuredFinal =
    typeof snapshotResponse === 'object' && snapshotResponse !== null ? snapshotResponse : undefined;

  return {
    provider: story.setup.provider,
    model: story.setup.model,
    systemPrompt: story.setup.systemPrompt,
    history: seededHistory,
    tools: story.setup.tools,
    schema: story.setup.schema,
    options: story.setup.options,
    initialInput,
    allowProviderChange: false,
    structuredRender: story.structuredRender,
    seededStructuredFinal,
  };
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

export const RecipeRunner: FC<Props> = ({ story }) => {
  if (!isRecipeStory(story)) {
    return <div style={{ padding: 24, color: '#9ca3af' }}>Not a recipe story.</div>;
  }
  return (
    <div>
      {story.pitch !== undefined && <Pitch pitch={story.pitch} />}
      <ChatView initial={buildInitial(story)} />
    </div>
  );
};
