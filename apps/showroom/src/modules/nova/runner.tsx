import { useEffect, useMemo, type FC } from 'react';
import type { ActionStory, LayoutStory, ShellStory, Story } from './story-types';
import { isNovaStory } from './story-types';
import { useRuntimeSetter, type RuntimeView } from './runtime-context';
import { buildLayoutBundle } from './evaluators/build-layout-bundle';
import { LayoutRunner } from './runners/layout-runner';
import { ActionRunner } from './runners/action-runner';
import { ShellRunner } from './runners/shell-runner';

const LayoutStoryView: FC<{ story: LayoutStory }> = ({ story }) => {
  const setView = useRuntimeSetter();
  const bundle = useMemo<RuntimeView>(() => {
    const built = buildLayoutBundle(story);
    return {
      data: built.data,
      renderTree: built.nodes,
      runtime: undefined,
      expectationResult: built.expectationResult,
      registry: built.registry,
    };
  }, [story]);

  useEffect(() => {
    setView(bundle);
    return () => {
      setView(undefined);
    };
  }, [bundle, setView]);

  return <LayoutRunner story={story} bundle={bundle} />;
};

const ActionStoryView: FC<{ story: ActionStory }> = ({ story }) => {
  const setView = useRuntimeSetter();
  return <ActionRunner story={story} onBundleUpdate={setView} />;
};

const ShellStoryView: FC<{ story: ShellStory }> = ({ story }) => {
  const setView = useRuntimeSetter();
  return <ShellRunner story={story} onBundleUpdate={setView} />;
};

const renderStory = (story: Story): ReturnType<FC> => {
  if (story.kind === 'layout') return <LayoutStoryView key={story.id} story={story} />;
  if (story.kind === 'action') return <ActionStoryView key={story.id} story={story} />;
  return <ShellStoryView key={story.id} story={story} />;
};

export const Runner: FC<{ story: unknown }> = ({ story }) => {
  if (!isNovaStory(story)) return null;
  return renderStory(story);
};
