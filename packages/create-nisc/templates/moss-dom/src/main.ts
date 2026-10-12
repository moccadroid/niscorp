import { browserEnv, createWire, readDocumentSnapshot } from '@niscorp/moss/client';
import { createTerminal } from '@niscorp/moss/terminal';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import './ui/kit.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const drawn = readDocumentSnapshot();
const wire = createWire({ env: browserEnv(), ...(drawn !== undefined ? { initial: drawn } : {}) });
createTerminal({ target: domTarget({ root, registry: buildRegistry() }), wire });
