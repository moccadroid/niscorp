import type { ActionDefinition } from '@niscorp/nova';
import { topicLayout } from './topic.layout';

// A guide to nisc, a card a topic: text in an action, and nothing else. Delete this folder to start your own app.
const topic = (id: string, title: string, description: string, paragraphs: readonly string[]): ActionDefinition => ({
  id,
  title,
  description,
  data: { title, paragraphs: [...paragraphs] },
  layout: topicLayout,
});

export const GUIDE: readonly ActionDefinition[] = [
  topic('guide.nisc', 'What nisc is', 'Explains what nisc is: apps built from data with schemas, which a person and a model can both read.', [
    'nisc builds apps out of data. Every screen, read, write and rule is JSON with a schema; code sits only at the edges.',
    'Because the app is data, a model can read it and put it together, and a person can check what it did. This app is led by one.',
  ]),
  topic('guide.actions', 'Actions', 'Explains actions: the JSON that everything on screen is, with its data, layout, triggers and endpoints.', [
    'Everything you see is an action: JSON holding its data, a layout, the triggers that answer clicks and messages, and the endpoints it reads and writes through. This card is one.',
    'An action opens on a canvas; here the areas a to f are canvases. Actions live in src/app/actions/.',
  ]),
  topic('guide.layouts', 'Layouts and the kit', 'Explains layouts and the kit: how an action is drawn without styling, and where the look lives.', [
    'A layout is JSON that names components and binds them to the action’s data. It never styles anything.',
    'The kit in src/ui/ is the only code that draws: its components, and the look in its stylesheet.',
  ]),
  topic('guide.shell', 'The shell and moss', 'Explains the shell and moss: where the app runs, one shell per person, on the server.', [
    'The shell holds the canvases and runs the actions. moss runs it on the server, one shell per person.',
    'The browser draws what moss sends over a socket, so the app’s rules hold on the server.',
  ]),
  topic('guide.data', 'Reads and writes', 'Explains reads and writes: vex queries and mutations written as JSON, run under the person’s policy.', [
    'Data comes through vex. A read is a query written as JSON and replayed by its fingerprint; a write is a mutation, the same way.',
    'Both run under the person’s policy. Tables go in src/db/schema.ts, reads and writes in src/app/vex/.',
  ]),
  topic('guide.charter', 'The charter', 'Explains the charter: what each role may do, and how moss holds the app to it.', [
    'The charter says what each role may do: which actions exist for them, which data they reach, and which server functions they may call.',
    'moss will not start an app whose charter does not add up. It is in src/app/charter/.',
  ]),
  topic('guide.answers', 'How your message becomes a screen', 'Explains how a message is answered here: Jev picks, a cortex agent composes the screen, and it streams in.', [
    'Jev, a fast decision model, reads your message and the screen and says which cards likely belong. Then gpt-oss, as a cortex agent, writes which areas change and with what.',
    'The answer is checked against the app’s actions, and the screen fills in while it is written. The code is in src/server/compose/.',
  ]),
  topic('guide.yours', 'Making it yours', 'Explains how to start your own app from this one: what to delete, and where tables, reads, writes and actions go.', [
    'Delete src/app/actions/guide/ and its lines in the action catalog, the composer’s catalog, the charter and the screens.',
    'Then add your tables in src/db/schema.ts, your reads and writes in src/app/vex/, and your actions in src/app/actions/, each with a description the model chooses by. Run npm run check after each step.',
  ]),
];
