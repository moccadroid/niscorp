import { fileURLToPath } from 'node:url';
import { runShapeCheck } from '@niscorp/cli/shape';
import { actions } from '../app/action-catalog';
import { ENTRIES } from '../app/vex';

process.exit(
  runShapeCheck({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    actions: Object.values(actions),
    entries: ENTRIES,
    // Every server function an action calls (an `fn:` endpoint), and what it does that a vex read or write cannot.
    functions: {
      ask: 'the model answers a message, and the turn goes into the conversation in the person’s shell',
      'screens.open': 'the screen shown lives in the person’s shell, not in rows',
    },
    // What the app is allowed, per rule, per file, each with why: { formatting: { 'src/server/today.ts': '…' } }.
    allow: {},
  }),
);
