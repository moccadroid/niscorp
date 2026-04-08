import type {
  ActionDefinition,
  ComponentRegistry,
  FetchFn,
  LayoutNode,
  LayoutStore,
  Shell,
} from '@niscorp/nova';
import type { NovaComponent } from '@niscorp/nova/react';
import type { StoryExpectation } from '../../lib/check-expectation';

export type { StoryExpectation };

export type StoryKind = 'layout' | 'action' | 'shell';

export type StoryBase = {
  id: string;
  name: string;
  description: string;
  category: string;
};

export type LayoutStory = StoryBase & {
  kind: 'layout';
  layout: LayoutNode;
  data?: Record<string, unknown>;
  extraComponents?: Record<string, NovaComponent>;
  preloadLayouts?: Record<string, LayoutNode>;
  expected?: StoryExpectation;
};

export type ActionStory = StoryBase & {
  kind: 'action';
  action: ActionDefinition;
  extraComponents?: Record<string, NovaComponent>;
  expected?: StoryExpectation;
  fetch?: FetchFn;
};

export type ShellSetupDeps = {
  registry: ComponentRegistry<NovaComponent>;
  layoutStore: LayoutStore;
};

export type ShellInitialPush = {
  canvas: string;
  actionId: string;
  input?: Record<string, unknown>;
};

export type ShellStory = StoryBase & {
  kind: 'shell';
  shellSetup: (deps: ShellSetupDeps) => Shell;
  initialPushes?: ShellInitialPush[];
  canvases?: string[];
  extraComponents?: Record<string, NovaComponent>;
  expected?: StoryExpectation;
};

export type Story = LayoutStory | ActionStory | ShellStory;

const isObjectWithKind = (
  value: unknown,
): value is { kind: unknown; id: unknown; name: unknown; description: unknown; category: unknown } => {
  if (value === null || typeof value !== 'object') return false;
  return 'kind' in value && 'id' in value && 'name' in value;
};

export const isNovaStory = (value: unknown): value is Story => {
  if (!isObjectWithKind(value)) return false;
  return value.kind === 'layout' || value.kind === 'action' || value.kind === 'shell';
};

