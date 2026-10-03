import { browserEnv, createWire, readDocumentSnapshot } from '@niscorp/moss/client';
import { createTerminal } from '@niscorp/moss/terminal';
import { domTarget } from '@niscorp/moss/terminal/dom';
import { buildRegistry } from './ui/registry';
import './ui/kit.css';

// The browser: the kit, handed to moss's terminal — plain DOM, no framework. It
// knows nothing about the app: it draws the trees the socket sends and sends
// back what was pressed.
//
// The page arrives with the first screen already in it (src/server/document.ts)
// and the snapshot it was drawn from beside it; the wire starts from that
// snapshot, and the DOM adapter's first render puts the same elements back.
// `cookie` keeps a copy of the session token where a page request can carry
// it, which is how the server will know whose screen to draw once people can
// sign in.
const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const drawn = readDocumentSnapshot();
const wire = createWire({ env: browserEnv({ cookie: true }), ...(drawn !== undefined ? { initial: drawn } : {}) });
createTerminal({ target: domTarget({ root, registry: buildRegistry() }), wire });
