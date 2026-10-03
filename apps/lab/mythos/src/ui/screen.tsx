import { hydrateRoot } from 'react-dom/client';
import { NovaShellProvider, RenderTree, useCanvas, useRenderTree } from '@niscorp/nova/adapters/react';
import type { Shell } from '@niscorp/nova';

// The canvas framing — chrome on top, main below, overlay as a modal backdrop
// whenever its canvas has an active instance — over whichever shell it is
// handed. It is drawn three ways from this one description: to markup at build
// (nisc.config.ts), over that markup in the page (`adopt`), and from nothing in
// dev (main.tsx).

const ActiveCanvas = ({ canvasId }: { canvasId: string }): React.JSX.Element => {
  const canvas = useCanvas(canvasId);
  const tree = useRenderTree(canvas.active?.id ?? '');
  return <RenderTree nodes={tree} />;
};

const Frame = (): React.JSX.Element => {
  const overlay = useCanvas('overlay');
  return (
    <div className="app-frame">
      <ActiveCanvas canvasId="chrome" />
      <main>
        <ActiveCanvas canvasId="main" />
      </main>
      {overlay.active !== undefined ? (
        <div className="backdrop">
          <div className="modal-slot">
            <ActiveCanvas canvasId="overlay" />
          </div>
        </div>
      ) : null}
    </div>
  );
};

// No registry prop: the provider falls back to shell.registry, the same
// instance assembled in createAppShell.
export const Screen = ({ shell }: { shell: Shell }): React.JSX.Element => (
  <NovaShellProvider shell={shell}>
    <Frame />
  </NovaShellProvider>
);

// Pick up a screen that arrived drawn. The one call both the page (main.tsx)
// and the build's adoption check (nisc.config.ts) make.
export const adopt = (root: HTMLElement, shell: Shell): void => {
  hydrateRoot(root, <Screen shell={shell} />);
};
