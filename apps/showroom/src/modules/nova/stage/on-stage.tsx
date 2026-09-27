import type { FC } from 'react';
import { PhoneStyles } from '@showroom/chrome/stage/phone';
import { Chip, INK } from '@showroom/chrome/stage/ui';
import type { NovaStory, NovaStoryKind } from '../story-types';
import { Device, type DeviceSize } from './device';

// ═══════════════════════════════════════════════════════════
// Every nova story, on a device.
//
// Applied once, where the stories are registered: `onStage` swaps a story's
// Demo for one that draws the original Demo inside a phone (or a tablet) on
// the stage's light page, with a one-line caption under it. The story object
// keeps everything else — `shell`, `layout`, `data`, `source` — so the
// Structure, Data and Registry tabs read exactly what they read before.
//
// `self` is for the few demos that carry controls of their own (the language
// switchers, the sign-in toggle): they draw their device themselves, so the
// control sits beside the screen instead of inside it.
// ═══════════════════════════════════════════════════════════

export type StageFrame = DeviceSize | 'self';

const CAPTION: Record<NovaStoryKind, string> = {
  layout: 'A layout: JSON in, a screen out — drawn by nova’s React builtins.',
  action: 'An action: a layout plus the data and triggers that make it react. Tap it.',
  shell: 'A shell: canvases that hold actions, arranged by a layout of their own.',
  i18n: 'The same screen in another language — swapped in nova’s renderer, not in a component.',
};

const KIND_LABEL: Record<NovaStoryKind, string> = { layout: 'layout', action: 'action', shell: 'shell', i18n: 'language' };

const canvasCount = (story: NovaStory): number => (story.shell === undefined ? 0 : Object.keys(story.shell.getState().canvases).length);

const Caption: FC<{ story: NovaStory }> = ({ story }) => {
  const canvases = canvasCount(story);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: 560, textAlign: 'center' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Chip tone="accent">{KIND_LABEL[story.kind]}</Chip>
        {canvases > 1 && <Chip>{canvases} canvases</Chip>}
        {story.shell === undefined && story.layout !== undefined && <Chip>no shell · Nova.Layout</Chip>}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: INK.soft }}>{CAPTION[story.kind]}</div>
      <div style={{ fontSize: 12, color: INK.faint }}>
        The tree behind it is in the inspector: Structure{story.shell === undefined ? '' : ', Data'} and Registry.
      </div>
    </div>
  );
};

const StoryStage: FC<{ story: NovaStory; frame: StageFrame; Demo: FC }> = ({ story, frame, Demo }) => (
  <div style={{ padding: '28px 20px 48px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, color: INK.text }}>
    <PhoneStyles />
    {frame === 'self' ? (
      <Demo />
    ) : (
      <Device size={frame} status={story.category}>
        <Demo />
      </Device>
    )}
    <Caption story={story} />
  </div>
);

// Wrap one story. The original Demo is captured, not re-exported — the Source
// tab still shows the demo file, which is the code that matters.
export const onStage = (story: NovaStory, frame: StageFrame): NovaStory => {
  const Original = story.Demo;
  const Staged: FC = () => <StoryStage story={story} frame={frame} Demo={Original} />;
  return { ...story, Demo: Staged };
};
