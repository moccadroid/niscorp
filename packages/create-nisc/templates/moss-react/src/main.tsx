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
// snapshot, so the first render adopts the elements already there. Once people
// can sign in, the browser keeps the session in a cookie this page cannot
// read; it rides the page request and the socket by itself, which is how the
// server knows whose screen to draw.
const root = document.getElementById('root');
if (root === null) throw new Error('index.html has no #root');

const drawn = readDocumentSnapshot();
const wire = createWire({ env: browserEnv(), ...(drawn !== undefined ? { initial: drawn } : {}) });
createTerminal({ target: reactTarget({ root, registry: buildRegistry() }), wire });
