// A default export, which the style guide otherwise bans: vite reads its config
// from one, so this file has to match vite's shape (AGENTS.md rule 16, a shim).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
