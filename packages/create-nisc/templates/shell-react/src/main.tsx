import { createRoot } from 'react-dom/client';
import { shellSettled } from '@niscorp/nova';
import { boot } from './boot';
import { Screen, adopt } from './ui/screen';
import './ui/kit.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const shell = boot();
if (root.hasChildNodes()) {
  await shellSettled(shell, { waitMs: 10_000 });
  adopt(root, shell);
} else {
  createRoot(root).render(<Screen shell={shell} />);
}
