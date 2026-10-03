import { createRoot } from 'react-dom/client';
import { shellSettled } from '@niscorp/nova';
import { boot } from './boot';
import { Screen, adopt } from './ui/screen';
import './ui/kit.css';

// The entry: boot the shell, then one of two things —
//
//   the screen ARRIVED DRAWN (`nisc export` or `nisc start` wrote it into the
//   root): the shell reaches that same screen, and picks the elements up as
//   they are;
//
//   the root is empty (dev): the screen is rendered from nothing.
//
// Either way the shell is this page's own from here on.
const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const shell = boot();
if (root.hasChildNodes()) {
  await shellSettled(shell, { waitMs: 10_000 });
  adopt(root, shell);
} else {
  createRoot(root).render(<Screen shell={shell} />);
}
