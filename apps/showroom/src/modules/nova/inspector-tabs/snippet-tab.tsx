import { useMemo, type FC } from 'react';
import { CodeView } from '../../../chrome/code-view';
import type { ActionStory, LayoutStory, ShellStory, Story } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Snippet tab — emits a copy-pasteable TypeScript example of
// how to USE nova for this story's pattern. Not the story file
// itself — the actual recipe a consumer would lift into their
// own React app.
// ═══════════════════════════════════════════════════════════

const LEGEND =
  'A copy-pasteable usage snippet for this story. Paste it into your own project to reproduce the demo.';

const indentJson = (value: unknown, indent: number): string => {
  const text = JSON.stringify(value, null, 2);
  if (text === undefined) return 'undefined';
  const pad = ' '.repeat(indent);
  return text
    .split('\n')
    .map((line, i) => (i === 0 ? line : pad + line))
    .join('\n');
};

const buildLayoutSnippet = (story: LayoutStory): string => {
  const layoutJson = indentJson(story.layout, 4);
  const dataJson = indentJson(story.data ?? {}, 4);
  const preloadBlock =
    story.preloadLayouts === undefined
      ? ''
      : `\n// Pre-populate the layout store with named layouts referenced by LayoutRefNode.\n${Object.entries(
          story.preloadLayouts,
        )
          .map(
            ([name, node]) =>
              `layoutStore.set('${name}', ${indentJson(node, 0)});`,
          )
          .join('\n')}\n`;
  return `import { renderLayout, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';
import { NovaRenderProvider, RenderTree } from '@niscorp/nova/react';

// 1. Build a registry with the default React components.
const registry = createComponentRegistry();
registerNovaReactComponents(registry);

// 2. Create a layout store. (Used by LayoutRefNode lookups.)
const layoutStore = createLayoutStore();
${preloadBlock}
// 3. Define your layout JSON and the data it reads from.
const layout = ${layoutJson};

const data = ${dataJson};

// 4. Render the layout to a tree of RenderNodes.
const nodes = renderLayout(layout, data, {
  store: layoutStore,
  registry,
  strict: false,
  onError: (err) => console.error(err),
});

// 5. Mount it via the React adapter. The provider hosts dispatch/publish
//    callbacks for components that need to emit events; for a static
//    layout demo, no-ops are fine.
const noop = () => {};

export const Demo = () => (
  <NovaRenderProvider registry={registry} dispatch={noop} publish={noop}>
    <RenderTree nodes={nodes} />
  </NovaRenderProvider>
);
`;
};

const buildActionSnippet = (story: ActionStory): string => {
  const actionJson = indentJson(story.action, 2);
  return `import { createShell, createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';
import { NovaShellProvider, useCanvas, useRenderTree, RenderTree } from '@niscorp/nova/react';
import { useEffect } from 'react';

// 1. Build a registry with the default React components.
const registry = createComponentRegistry();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

// 2. Define the action.
const action = ${actionJson};

// 3. Construct a shell with one canvas and the action registered.
const shell = createShell({
  canvases: ['main'],
  registry,
  layoutStore,
  actions: { [action.id]: action },
  onError: (err) => console.error(err),
});

// 4. Push the action onto the canvas.
shell.push('main', action.id);

// 5. Mount via the React adapter. ActiveCanvas reads the live render tree
//    and re-renders whenever the action's data store changes.
const ActiveCanvas = () => {
  const canvas = useCanvas('main');
  const tree = useRenderTree(canvas.active?.id ?? '');
  return <RenderTree nodes={tree} />;
};

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    <ActiveCanvas />
  </NovaShellProvider>
);
`;
};

const buildShellSnippet = (story: ShellStory): string => {
  const setupBody = story.shellSetup.toString();
  const initialPushesJson = indentJson(story.initialPushes ?? [], 2);
  const canvasesJson = indentJson(story.canvases ?? [], 2);
  return `import { createComponentRegistry, createLayoutStore } from '@niscorp/nova';
import { registerNovaReactComponents } from '@niscorp/nova/components/react';
import { NovaShellProvider, useCanvas, useRenderTree, RenderTree } from '@niscorp/nova/react';
import { useEffect } from 'react';

// 1. Build a registry with the default React components.
const registry = createComponentRegistry();
registerNovaReactComponents(registry);
const layoutStore = createLayoutStore();

// 2. Construct the shell. Stories define this via a setup function so
//    multiple actions / multiple canvases can be wired together.
const shellSetup = ${setupBody};

const shell = shellSetup({ registry, layoutStore });

// 3. Initial pushes — what's mounted on each canvas at start.
const initialPushes = ${initialPushesJson};
for (const push of initialPushes) {
  shell.push(push.canvas, push.actionId, push.input);
}

// 4. Render every canvas you care about. The shell can host as many as
//    your shellSetup defines.
const CANVAS_IDS = ${canvasesJson};

const Canvas = ({ id }) => {
  const canvas = useCanvas(id);
  const tree = useRenderTree(canvas.active?.id ?? '');
  return <RenderTree nodes={tree} />;
};

export const Demo = () => (
  <NovaShellProvider shell={shell} registry={registry}>
    {CANVAS_IDS.map((id) => <Canvas key={id} id={id} />)}
  </NovaShellProvider>
);
`;
};

const buildSnippet = (story: Story): string => {
  if (story.kind === 'layout') return buildLayoutSnippet(story);
  if (story.kind === 'action') return buildActionSnippet(story);
  return buildShellSnippet(story);
};

type Props = { story: Story };

export const SnippetTab: FC<Props> = ({ story }) => {
  const source = useMemo(() => buildSnippet(story), [story]);
  return <CodeView legend={LEGEND} source={source} />;
};
