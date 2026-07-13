import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/css/theme.css';
import './ui/css/ui.css';
import { Fable } from './app';

const root = document.getElementById('root');
if (root === null) throw new Error('No root element');
createRoot(root).render(
  <StrictMode>
    <Fable />
  </StrictMode>,
);
