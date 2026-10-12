import { shellSettled } from '@niscorp/nova';
import { boot } from './boot';
import { adopt } from './ui/screen';
import './ui/kit.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const shell = boot();
await shellSettled(shell, { waitMs: 10_000 });
adopt(root, shell);
