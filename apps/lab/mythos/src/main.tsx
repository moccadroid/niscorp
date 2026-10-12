import { createRoot } from 'react-dom/client';
import { shellSettled } from '@niscorp/nova';
import { getApp } from './boot';
import { Screen, adopt } from './ui/screen';
import './ui/styles.css';

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
