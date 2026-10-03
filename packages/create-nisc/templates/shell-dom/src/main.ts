import { shellSettled } from '@niscorp/nova';
import { boot } from './boot';
import { adopt } from './ui/screen';
import './ui/kit.css';

// The entry: boot the shell, let it reach its first screen, and mount it — over
// the screen that arrived drawn (`nisc export` or `nisc start` wrote it), or
// into an empty root (dev). The shell is this page's own from here on.
const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const shell = boot();
await shellSettled(shell, { waitMs: 10_000 });
adopt(root, shell);
