import { createRoot } from 'react-dom/client';
import { NovaShellProvider, RenderTree, useCanvas, useRenderTree } from '@niscorp/nova/react';
import { getApp } from './boot';
import './ui/styles.css';

// The React entry — the only JSX outside src/ui. Shell construction and
// canvas framing only: chrome on top, main below, overlay as a modal
// backdrop whenever its canvas has an active instance.

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

const mount = async (): Promise<void> => {
  const app = await getApp();
  const rootElement = document.getElementById('root');
  if (rootElement === null) throw new Error('missing #root element');
  createRoot(rootElement).render(
    // No registry prop: the provider falls back to shell.registry, the same
    // instance assembled in createAppShell.
    <NovaShellProvider shell={app.shell}>
      <Frame />
    </NovaShellProvider>,
  );
};

void mount();
