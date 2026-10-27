import { browserEnv, createWire, readDocumentSnapshot } from '@niscorp/moss/client';
import { createTerminal } from '@niscorp/moss/terminal';
import { buildRegistry } from './ui/registry';
import { miraTarget } from './ui/target';
import '@fontsource-variable/archivo/wdth.css';
import './ui/kit.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const drawn = readDocumentSnapshot();
const wire = createWire({ env: browserEnv(), ...(drawn !== undefined ? { initial: drawn } : {}) });
createTerminal({ target: miraTarget({ root, registry: buildRegistry() }), wire });
