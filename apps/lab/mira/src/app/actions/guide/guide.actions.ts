import type { ActionDefinition, LayoutNode } from '@niscorp/nova';
import { exampleLayout, pointsLayout, stepsLayout } from './guide.layouts';

// A guide to nisc: text in actions, and nothing else. Delete this folder to start your own app.
// A card's next questions are asked when pressed, as if typed.
const card = (id: string, description: string, layout: LayoutNode, data: { title: string; lead: string; next: readonly string[] } & Record<string, unknown>): ActionDefinition => ({
  id,
  title: data.title,
  description,
  data: { ...data, next: [...data.next] },
  layout,
  triggers: [{ event: 'ui:click', ref: 'next', do: [{ emit: { channel: 'ask', payload: '@event.payload' } }] }],
});

export const GUIDE: readonly ActionDefinition[] = [
  card('guide.nisc', 'What nisc is: apps built out of data, which a model can build with you.', pointsLayout, {
    title: 'What nisc is',
    lead: 'nisc builds apps out of data, so a model can build them with you.',
    points: [
      { title: 'Everything is data', text: 'Screens, reads, writes and rules are JSON, each with a schema.' },
      { title: 'Code at the edges', text: 'The kit draws and the server serves; the rest is data, checked.' },
      { title: 'Led by a model', text: 'This app answers every message with a screen of its own cards.' },
    ],
    next: ['What is an action?', 'How does my message become a screen?'],
  }),
  card('guide.actions', 'Actions: the JSON everything on screen is, with an example of one.', exampleLayout, {
    title: 'Actions',
    lead: 'Everything you see is an action: JSON with its data, its layout, and what it does when you press something.',
    example: [
      '{',
      '  "id": "guide.shell",',
      '  "data": { "title": "The shell and moss" },',
      '  "layout": { "component": "Card", "props": { "title": "{{$.title}}" } },',
      '  "triggers": [{ "event": "ui:click", "ref": "next", "do": [{ "emit": { "channel": "ask" } }] }]',
      '}',
    ].join('\n'),
    text: 'This card is one. Actions live in src/app/actions/.',
    next: ['How is an action drawn?', 'Where does data come from?'],
  }),
  card('guide.layouts', 'Layouts and the kit: how an action is drawn without any styling, with an example layout.', exampleLayout, {
    title: 'Layouts and the kit',
    lead: 'A layout is JSON that names components and binds them to the action’s data. It never styles anything.',
    example: ['{', '  "component": "Card",', '  "props": { "title": "{{$.title}}" },', '  "children": [{ "component": "Text", "children": "{{$.lead}}" }]', '}'].join('\n'),
    text: 'The kit in src/ui/ is the only code that draws, and its stylesheet the only place the look lives.',
    next: ['What runs the screen?', 'What is an action?'],
  }),
  card('guide.shell', 'The shell and moss: where the app runs, one shell per person, on the server.', pointsLayout, {
    title: 'The shell and moss',
    lead: 'The shell holds the canvases and runs the actions on them.',
    points: [
      { title: 'One per person', text: 'moss keeps a shell for each person, on the server.' },
      { title: 'Drawn where you are', text: 'Your browser draws the frames moss sends over a socket.' },
      { title: 'Rules on the server', text: 'What you may do is decided there, never in the browser.' },
    ],
    next: ['Who may do what?', 'Where does data come from?'],
  }),
  card('guide.data', 'Reads and writes: vex queries and mutations written as JSON, with an example read.', exampleLayout, {
    title: 'Reads and writes',
    lead: 'Data comes through vex: a read is a query written as JSON, replayed by its fingerprint.',
    example: ['{', '  "fingerprint": "notes/list",', '  "intent": "Every note, newest first",', '  "dsl": { "from": ["notes"], "sort": [{ "field": "notes.created_at", "dir": "desc" }], "limit": 100 }', '}'].join('\n'),
    text: 'A write is the same, as a mutation. Both run under the person’s policy; yours go in src/app/vex/.',
    next: ['Who may do what?', 'How do I make this app mine?'],
  }),
  card('guide.charter', 'The charter: what each role may do, with this app’s own charter as the example.', exampleLayout, {
    title: 'The charter',
    lead: 'The charter says what each role may do: which actions exist for them, which data they reach, which server functions they call.',
    example: [
      '{',
      '  "public": {',
      '    "actions": ["ask.*", "answer.*", "guide.*"],',
      '    "data": [],',
      '    "functions": ["ask", "screens.open", "answers.back", "answers.forward", "answers.go", "answers.current"]',
      '  }',
      '}',
    ].join('\n'),
    text: 'This is this app’s. moss will not start an app whose charter does not add up.',
    next: ['What runs the screen?', 'How do I make this app mine?'],
  }),
  card('guide.answers', 'How a message becomes a screen here, step by step: Jev picks, a cortex agent composes, the screen streams in.', stepsLayout, {
    title: 'How your message becomes a screen',
    lead: 'What happens between your question and the screen it gets.',
    steps: [
      'The dock sends your message to the server.',
      'Jev, a fast decision model, reads it with the screen and says which cards likely belong.',
      'gpt-oss, as a cortex agent, writes which areas change, and with which cards.',
      'The answer is checked against the cards the app has; one that does not hold is corrected.',
      'The screen fills in while the answer is still being written.',
    ],
    next: ['What is an action?', 'Who may do what?'],
  }),
  card('guide.yours', 'Making it yours, step by step: what to delete, and where tables, reads, writes and actions go.', stepsLayout, {
    title: 'Making it yours',
    lead: 'Start your own app from this one.',
    steps: [
      'Delete src/app/actions/guide/, and its lines in the action catalog, the composer’s catalog, the charter and the screens.',
      'Put your tables in src/db/schema.ts.',
      'Put your reads and writes in src/app/vex/.',
      'Add your actions in src/app/actions/, each with a description the model chooses by.',
      'Run npm run check after each step.',
    ],
    next: ['What is an action?', 'Where does data come from?'],
  }),
];
