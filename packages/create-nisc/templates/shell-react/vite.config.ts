// A default export, which the style guide otherwise bans: vite reads its config
// from one, so this file has to match vite's shape (AGENTS.md rule 16, a shim).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The bundle IS the app: the shell, its actions and its kit all run in the page.
export default defineConfig({
  plugins: [react()],
});
