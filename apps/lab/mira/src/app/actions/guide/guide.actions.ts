import type { ActionDefinition, LayoutNode, TriggerConfig } from '@niscorp/nova';
import { checklistAction } from './checklist.action';
import { counterAction } from './counter.action';
import { exampleLayout, pointsLayout, stepsLayout, welcomeLayout } from './guide.layouts';
import { quizAction } from './quiz.action';

// A tour of nisc, in actions: cards to read, and cards to use. Delete this folder to start your own app.
type Link = { label: string; screen: string };

// A link opens one of the app's screens, as the dock's own buttons do; nothing is asked of the model.
const opens: TriggerConfig = { event: 'ui:click', ref: 'link', do: [{ emit: { channel: 'open', payload: '@event.payload' } }] };
const asks: TriggerConfig = { event: 'ui:click', ref: 'example', do: [{ emit: { channel: 'ask', payload: '@event.payload' } }] };

const card = (id: string, description: string, layout: LayoutNode, data: { title: string; lead: string; links?: Link[] } & Record<string, unknown>, triggers = [opens]): ActionDefinition => ({
  id,
  title: data.title,
  description,
  data: { links: [], ...data },
  layout,
  triggers,
});

const counterJson = [
  '{',
  `  "id": "${counterAction.id}",`,
  `  "data": ${JSON.stringify(counterAction.data)},`,
  '  "triggers": [',
  (counterAction.triggers ?? []).map((trigger) => `    ${JSON.stringify(trigger)}`).join(',\n'),
  '  ],',
  '  "layout": { "component": "Card", "children": [ … ] }',
  '}',
].join('\n');

export const GUIDE: readonly ActionDefinition[] = [
  card('guide.welcome', 'The welcome: this app is a tour of nisc that a model leads; where the tour starts, and things to ask.', welcomeLayout, {
    title: 'Welcome to nisc',
    lead: 'This app is a short tour of nisc, and a model leads it. Use it like any app: press, tick, follow the links. Or ask for a screen, and the model builds it from these same cards.',
    links: [{ label: 'Start the tour →', screen: 'actions' }],
    examples: ['A counter that starts at 100', 'A checklist for my first nisc app', 'Quiz me on actions', 'Put the charter beside the counter'],
  }, [opens, asks]),
  card('guide.nisc', 'What nisc is: apps built out of data — screens, reads, writes and rules as JSON, each with a schema — and code only at the edges, so a model can build them with you.', pointsLayout, {
    title: 'What nisc is',
    lead: 'nisc builds apps out of data, so a model can build them with you.',
    points: [
      { title: 'Everything is data', text: 'Screens, reads, writes and rules are JSON, each with a schema.' },
      { title: 'Code at the edges', text: 'The kit draws and the server serves; the rest is data, checked.' },
      { title: 'Led by a model', text: 'Ask, and this app answers with a screen of its own cards.' },
    ],
    links: [{ label: 'Lesson 1: actions →', screen: 'actions' }],
  }),
  card('guide.actions', 'Actions: everything on screen is an action — JSON with its data, its layout, and its triggers, what a press does to the data; the counter’s as the example.', exampleLayout, {
    title: 'Actions',
    lead: 'Everything you see is an action: JSON with its data, its layout, and what a press does.',
    example: counterJson,
    text: 'That is the counter on this screen. Actions live in src/app/actions/.',
    links: [{ label: 'Next: asking for a screen →', screen: 'asking' }],
  }),
  card('guide.layouts', 'Layouts and the kit: a layout is JSON that names components and binds them to the action’s data, and never styles; the kit in src/ui/ draws them, and its stylesheet holds the look.', exampleLayout, {
    title: 'Layouts and the kit',
    lead: 'A layout is JSON that names components and binds them to the action’s data. It never styles anything.',
    example: ['{', '  "component": "Card",', '  "props": { "title": "{{$.title}}" },', '  "children": [', '    { "component": "Text", "children": "{{$.count}}" }', '  ]', '}'].join('\n'),
    text: 'The kit in src/ui/ is the only code that draws, and its stylesheet the only place the look lives.',
  }),
  card('guide.answers', 'How a message becomes a screen here, step by step: Jev, a fast decision model, says which cards likely belong; gpt-oss, as a cortex agent, writes which areas change and with what; the answer is checked against the catalog; the screen streams in.', stepsLayout, {
    title: 'How your message becomes a screen',
    lead: 'What happens between your question and the screen it gets.',
    steps: [
      'The dock sends your message to the server.',
      'Jev, a fast decision model, reads it with the screen and says which cards likely belong.',
      'gpt-oss, as a cortex agent, writes which areas change, with which cards, filled in.',
      'The answer is checked against the cards the app has; one that does not hold is corrected.',
      'The screen fills in while the answer is still being written.',
    ],
    links: [{ label: 'Next: who may do what →', screen: 'rules' }],
  }),
  card('guide.shell', 'The shell and moss: moss keeps one shell per person, on the server, which holds the cards and runs what they do; the browser only draws the frames moss sends over a socket.', pointsLayout, {
    title: 'The shell and moss',
    lead: 'The shell holds the cards and runs what they do.',
    points: [
      { title: 'One per person', text: 'moss keeps a shell for each person, on the server.' },
      { title: 'Drawn where you are', text: 'Your browser draws the frames moss sends over a socket.' },
      { title: 'Rules on the server', text: 'What you may do is decided there, never in the browser.' },
    ],
  }),
  card('guide.data', 'Reads and writes: vex queries and mutations written as JSON, replayed by their fingerprint and run under the person’s policy; an example read.', exampleLayout, {
    title: 'Reads and writes',
    lead: 'Data comes through vex: a read is a query written as JSON, replayed by its fingerprint.',
    example: [
      '{',
      '  "fingerprint": "notes/list",',
      '  "intent": "Every note, newest first",',
      '  "dsl": {',
      '    "from": ["notes"],',
      '    "sort": [{ "field": "notes.created_at", "dir": "desc" }],',
      '    "limit": 100',
      '  }',
      '}',
    ].join('\n'),
    text: 'A write is the same, as a mutation. Both run under the person’s policy; yours go in src/app/vex/.',
  }),
  card('guide.charter', 'The charter: which actions, data and server functions each role may reach, decided on the server; this app’s own charter as the example.', exampleLayout, {
    title: 'The charter',
    lead: 'The charter says what each role may do: which actions exist for them, which data they reach, which server functions they call.',
    example: [
      '{',
      '  "public": {',
      '    "actions": ["ask.*", "answer.*", "guide.*"],',
      '    "data": [],',
      '    "functions": [',
      '      "ask", "screens.open", "answers.current",',
      '      "answers.back", "answers.forward", "answers.go"',
      '    ]',
      '  }',
      '}',
    ].join('\n'),
    text: 'This is this app’s. moss will not start an app whose charter does not add up.',
    links: [{ label: 'Next: make it yours →', screen: 'yours' }],
  }),
  card('guide.yours', 'Making it yours, step by step: delete the guide, then tables go in src/db/schema.ts, reads and writes in src/app/vex/, actions in src/app/actions/.', stepsLayout, {
    title: 'Making it yours',
    lead: 'Start your own app from this one.',
    steps: [
      'Delete src/app/actions/guide/, and its lines in the action catalog, the composer’s catalog, the charter and the screens.',
      'Put your tables in src/db/schema.ts.',
      'Put your reads and writes in src/app/vex/.',
      'Add your actions in src/app/actions/, each with a description the model chooses by.',
      'Run npm run check after each step.',
    ],
    links: [{ label: 'Back to the start →', screen: 'start' }],
  }),
  counterAction,
  checklistAction,
  quizAction,
];
