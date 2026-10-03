import { createRoot } from 'react-dom/client';
import { shellSettled } from '@niscorp/nova';
import { getApp } from './boot';
import { Screen, adopt } from './ui/screen';
import './ui/styles.css';

// The React entry. Shell construction, then one of two things:
//
//   the screen ARRIVED DRAWN (`nisc export` wrote it into the root) — the page's
//   own shell reaches that same screen, and picks the elements up as they are;
//
//   the root is empty (dev) — the screen is rendered from nothing.
//
// Either way the shell is this page's own from here on.

// A drawn screen stays on the page while the shell boots; this is how long the
// boot may take before the screen is picked up as it stands.
const BOOT_WAIT_MS = 10_000;

const mount = async (): Promise<void> => {
  const app = await getApp();
  const rootElement = document.getElementById('root');
  if (rootElement === null) throw new Error('missing #root element');
  if (rootElement.hasChildNodes()) {
    await shellSettled(app.shell, { waitMs: BOOT_WAIT_MS });
    adopt(rootElement, app.shell);
    return;
  }
  createRoot(rootElement).render(<Screen shell={app.shell} />);
};

void mount();
