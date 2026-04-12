import { z } from 'zod';
import type { StreamDemoStory } from '../story-types';

// ═══════════════════════════════════════════════════════════
// Scoped errors — each select() observes only its own path's
// errors. Independent components can handle their own failures
// without a global error handler.
// ═══════════════════════════════════════════════════════════

export const scopedErrorsStory: StreamDemoStory = {
  id: 'scoped-errors',
  name: 'Scoped error observation',
  description: 'select().onError() fires only for errors at-or-below its path. Each part of the UI handles its own stream errors independently.',
  category: 'Validation',
  kind: 'stream-demo',
  pitch: {
    headline: 'Each component owns its errors.',
    body: "In a real app, the widget header and the data table are rendered by different components. If the LLM hallucinates a field in the widget, the table component shouldn't care — and it doesn't. select('widget').onError() fires for widget errors only. select('table').onError() fires for table errors only. No central error bus, no filtering logic, no cross-talk.",
  },
  demo: {
    schema: z.object({
      widget: z.object({
        type: z.string(),
        title: z.string(),
        icon: z.string(),
      }),
      table: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.number())),
      }),
      summary: z.string(),
    }),
    initial: {
      widget: { type: 'chart', title: 'loading…', icon: 'loader' },
      table: { headers: ['A', 'B'], rows: [[0, 0]] },
      summary: '',
    },
    // Two independent violations:
    //   widget.icon: number instead of string
    //   table.rows: string instead of array
    // widget.onError sees only widget.icon.
    // table.onError sees only table.rows.
    // summary.onError sees nothing.
    json: JSON.stringify({
      widget: { type: 'bar', title: 'Revenue', icon: 42 },
      table: { headers: ['Q1', 'Q2', 'Q3'], rows: 'not an array' },
      summary: 'Revenue grew 23% year over year driven by enterprise contracts.',
    }),
    chunkMode: 'token',
    delayMs: 25,
    tokensPerSecond: 50,
    selectPaths: ['widget', 'table', 'summary'],
    mode: 'recover',
    showModeSwitcher: true,
  },
  code: `import { createStream } from '@niscorp/solid';

const stream = createStream({ schema, initial });

// Widget component — only sees widget errors
const widget = stream.select('widget');
widget.on((w) => renderHeader(w));
widget.onError((err) => {
  showBadge('widget', err.path);  // "widget.icon: expected string, got number"
});

// Table component — only sees table errors
const table = stream.select('table');
table.on((t) => renderTable(t));
table.onError((err) => {
  showBadge('table', err.path);   // "table.rows: expected array, got string"
});

// Summary component — sees nothing; summary is fine
const summary = stream.select('summary');
summary.on((s) => renderSummary(s));
summary.onError((err) => {
  // never fires for this payload
});`,
};
