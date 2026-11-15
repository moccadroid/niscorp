import { fileURLToPath } from 'node:url';
import { runShapeCheck } from '@niscorp/cli/shape';
import { actions } from '../app/action-catalog';

process.exit(
  runShapeCheck({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    actions: Object.values(actions),
    // Every server function an action calls (an `fn:` endpoint), and what it does that a vex read or write cannot.
    functions: {},
    // What the app is allowed, per rule, per file, each with why: { formatting: { 'src/server/today.ts': '…' } }.
    allow: {},
  }),
);
