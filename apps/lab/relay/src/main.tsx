import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createWire } from '@niscorp/moss/client';
import { Terminal } from './ui/terminal';
import './ui/css/theme.css';
import './ui/css/ui.css';

// Relay's browser entry: mount the terminal on moss's wire. That's it —
// the renderer lives in ui/terminal.tsx, everything else is served.
const root = document.getElementById('root');
if (root === null) throw new Error('No root element');
createRoot(root).render(
  <StrictMode>
    <Terminal wire={createWire()} />
  </StrictMode>,
);
