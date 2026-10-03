import { browserEnv, createWire, readDocumentSnapshot } from '@niscorp/moss/client';
import { createTerminal } from '@niscorp/moss/terminal';
import { reactTarget } from '@niscorp/moss/terminal/react';
import { buildRegistry } from './ui/registry';
import './ui/kit.css';

// The browser: the kit, handed to moss's terminal. It knows nothing about the
// app — it draws the trees the socket sends and sends back what was pressed.
//
// The page arrives with the first screen already in it (src/server/document.ts)
// and the snapshot it was drawn from beside it; the wire starts from that
// snapshot, so the first render adopts the elements already there. `cookie`
// keeps a copy of the session token where a page request can carry it, which
// is how the server will know whose screen to draw once people can sign in.
const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const drawn = readDocumentSnapshot();
const wire = createWire({ env: browserEnv({ cookie: true }), ...(drawn !== undefined ? { initial: drawn } : {}) });
createTerminal({ target: reactTarget({ root, registry: buildRegistry() }), wire });
