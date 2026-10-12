import { hydrateRoot } from 'react-dom/client';
import { NovaShellProvider, RenderTree, useCanvas, useRenderTree } from '@niscorp/nova/adapters/react';
import type { Shell } from '@niscorp/nova';

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

export const Screen = ({ shell }: { shell: Shell }): React.JSX.Element => (
  <NovaShellProvider shell={shell}>
    <Frame />
  </NovaShellProvider>
);

export const adopt = (root: HTMLElement, shell: Shell): void => {
  hydrateRoot(root, <Screen shell={shell} />);
};
