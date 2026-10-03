// A default export, which the style guide otherwise bans: vite reads its config
// from one, so this file has to match vite's shape (AGENTS.md rule 16, a shim).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The browser's bundle: React and nothing else. The app server runs inside
// vite's dev process too, but that is `nisc dev`'s doing (moss's dev plugin,
// fed from nisc.config.ts) — nothing about it belongs here.
export default defineConfig({
  plugins: [react()],
});
