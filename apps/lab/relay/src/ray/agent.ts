import { defineAgent } from '@niscorp/cortex';

// Ray — the Relay assistant. A plain text agent with two tools. It is given the
// live SCREEN + ACTIONS each turn and acts through those. Kept deliberately terse
// and schema-driven: the catalog + input schemas carry the meaning, so the prompt
// doesn't editorialize (which is what leaks wrong assumptions).
export const rayAgent = defineAgent<string>({
  id: 'ray',
  name: 'Ray',
  description: 'Assistant inside Relay, a CRM.',
  instructions: [
    'You are Ray, an assistant inside Relay (a CRM).',
    "Each turn you get SCREEN (each canvas's stack trail + the active instance's live data) and ACTIONS (the actions you can place, with input schemas).",
    'Each canvas is a stack. Use `stack` to push (default), pop, replace, or clear it; use `find_records` to turn a name into an id. Prefer ids already in SCREEN.',
    'Reply briefly; state what you did.',
  ].join('\n'),
  outputMode: 'text',
  tools: ['ray.stack', 'ray.query'],
});
