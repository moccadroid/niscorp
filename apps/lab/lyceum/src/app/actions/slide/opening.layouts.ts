import type { LayoutNode } from '@niscorp/nova';
import { sendLayout } from '@lyceum/app/actions/questions/send.layout';

// THE OPENING'S LAYOUTS — the talk up to the census: nova, and what follows
// from it. One loud thing per slide, a little to read beside it, and a picture
// where a picture says it faster: the flow of events and trees, two phones side
// by side, the real form rendered from its own JSON.

const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({
  component: 'Cell',
  props: { area, ...props },
  children,
});

const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const text = (words: string, muted = false): LayoutNode => ({ component: 'Text', ...(muted ? { props: { tone: 'muted' } } : {}), children: words });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });

// The slide's sentences, one Text each.
const sentences: LayoutNode = { for: '$.lines', as: 'line', do: { component: 'Text', children: '{{$line.text}}' } };

// NOT BUILT YET, hatched — an empty `pending` draws nothing.
const todo: LayoutNode = {
  if: '$.pending',
  then: cell('todo', [label('Not built yet'), text('{{$.pending}}')], { mark: 'hatch' }),
};

// A phone, drawn with the kit: the person's line, one thing on screen, a bar of
// tabs side by side. A drawing, not a phone — its tabs are the ones given here.
type Tab = { name: string; ink?: 'alert' | 'ink' };
const phone = (owner: string, body: LayoutNode[], tabs: readonly Tab[]): LayoutNode => ({
  component: 'Sheet',
  props: { size: 'fill', areas: ['self', 'body', 'tabs'], rows: ['auto', 1, 'auto'] },
  children: [
    cell('self', [text(owner)]),
    cell('body', body),
    cell(
      'tabs',
      [
        {
          component: 'Sheet',
          props: { areas: [tabs.map((_, i) => `t${i}`).join(' ')] },
          children: tabs.map((tab, i) => cell(`t${i}`, [label(tab.name)], { align: 'center', ...(tab.ink === undefined ? {} : { ink: tab.ink }) })),
        },
      ],
      { pad: 'none' },
    ),
  ],
});

const TABS: readonly Tab[] = [{ name: 'Card' }, { name: 'Q&A' }, { name: 'Assistant', ink: 'ink' }];

// 1 · The title: the name, what it is, the way in — a code to scan, the address,
// and the SSH command where the deployment has one.
export const openingTitleLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick join', 'head head join', 'body count join'], cols: [1, 1, 1.1], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('body', [text('{{$.lines.0}}'), text('{{$.lines.1}}', true)]),
    cell('count', [{ component: 'Figure', props: { label: 'Joined', value: '$.counts.joined' } }], { ink: 'live', align: 'end' }),
    cell('join', [
      label('Scan to join'),
      { component: 'Qr', props: { value: '$.address.url' } },
      headline('name', '{{$.address.host}}'),
      { if: '$.address.ssh', then: { component: 'Code', props: { text: '$.address.ssh' } } },
    ]),
  ],
};

// 2 · The timer: what the model wrote, counting down, big.
export const timerLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick clock', 'head clock', 'body clock', 'what what'], cols: [1.3, 1], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')], { align: 'end' }),
    cell('body', [sentences]),
    cell('clock', [{ component: 'Countdown', props: { label: 'Until the last slide', to: '$.timer.due_at' } }], { ink: 'live', align: 'center' }),
    {
      if: '$.timer.intent',
      then: cell('what', [label('Asked for'), text('{{$.timer.intent}}')]),
      else: cell('what', [text('No timer saved yet.', true)], { mark: 'hatch' }),
    },
  ],
};

// 3 · The problem, and the two answers to it.
export const problemLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'one two', 'root root'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('one', [label('{{$.one.label}}'), headline('name', '{{$.one.title}}'), text('{{$.one.text}}')]),
    cell('two', [label('{{$.two.label}}'), headline('name', '{{$.two.title}}'), text('{{$.two.text}}')], { ink: 'signal' }),
    cell('root', [text('{{$.root}}')], { ink: 'ink' }),
  ],
};

// 4 · An action: its source, and beside it the same layout rendered — the real
// form's JSON, placed here as it is placed on a phone.
export const actionLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick code form', 'head code form', 'body code form'], cols: [1, 1.5, 0.9], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')], { align: 'end' }),
    cell('body', [sentences]),
    cell('code', [label('{{$.file}}'), { component: 'Code', props: { text: '$.code', marked: '$.marked' } }], { ink: 'ink' }),
    cell('form', [label('Its layout, rendered'), sendLayout], { ink: 'highlight' }),
  ],
};

// 5 · The shell: what holds the actions, and what crosses the wire.
export const shellLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick', 'head head', 'nest flow', 'body body'], cols: [1, 1.25], rows: ['auto', 'auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')]),
    cell(
      'nest',
      [
        {
          component: 'Sheet',
          props: { size: 'fill', areas: ['shell shell', 'one two', 'a b'], rows: ['auto', 'auto', 1] },
          children: [
            cell('shell', [label('Shell'), text('One per person. Which actions, on which canvas, with what data.')], { ink: 'ink' }),
            cell('one', [label('Canvas · stack'), text('The top instance renders.')], { ink: 'signal' }),
            cell('two', [label('Canvas · list'), text('Every instance renders — the tab bar.')], { ink: 'signal' }),
            cell('a', [{ component: 'Code', props: { text: 'body\n  questions.desk' } }]),
            cell('b', [{ component: 'Code', props: { text: 'tabs\n  member.card\n  questions.desk\n  assistant.thread' } }]),
          ],
        },
      ],
      { pad: 'none' },
    ),
    cell(
      'flow',
      [
        {
          component: 'Flow',
          props: {
            from: 'Your phone',
            to: 'The server',
            lanes: [
              { label: 'Events up: a press, a keystroke', toward: 'to', ink: 'alert' },
              { label: 'Trees down: what to draw', toward: 'from', ink: 'live' },
            ],
          },
        },
      ],
      { pad: 'none' },
    ),
    cell('body', [sentences]),
  ],
};

// 6 · The question the room is asking: isn't this json-render?
export const compareLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick', 'head', 'table', 'words'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell(
      'table',
      [
        {
          component: 'Rows',
          props: {
            rows: '$.rows',
            rowKey: 'what',
            columns: [
              { label: '', key: 'what', w: 0.8 },
              { label: 'json-render · A2UI', key: 'theirs', w: 1.4 },
              { label: 'nova', key: 'ours', w: 1.4 },
            ],
          },
        },
      ],
      { pad: 'none' },
    ),
    cell('words', [sentences], { ink: 'highlight' }),
  ],
};

// 7 · Pushing actions: to everyone, a group, one person.
export const pushLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head count', 'all group one', 'body body body', 'todo todo todo'], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('count', [{ component: 'Figure', props: { label: 'Phones to push to', value: '$.counts.joined' } }], { ink: 'live', align: 'end' }),
    { for: '$.targets', as: 'target', key: 'area', do: { component: 'Cell', props: { area: '$target.area', ink: '$target.ink' }, children: [label('{{$target.label}}'), headline('name', '{{$target.title}}'), text('{{$target.text}}')] } },
    cell('body', [sentences]),
    todo,
  ],
};

// 8 · No front-end gate: two phones, one with an action the other lacks.
export const gateLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head yours theirs', 'body yours theirs', 'todo todo todo'], cols: [1.3, 0.8, 0.8], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')], { align: 'end' }),
    cell('body', [sentences]),
    cell('yours', [label('Holds it'), phone('Somebody lucky', [headline('name', 'Fart'), text('A button. It exists here.')], [{ name: 'Card' }, { name: 'Q&A' }, { name: 'Fart', ink: 'alert' }])], { pad: 'none' }),
    cell('theirs', [label('Does not'), phone('Everybody else', [text('Nothing about it was sent to this phone.', true)], [{ name: 'Card' }, { name: 'Q&A' }])], { pad: 'none' }),
    todo,
  ],
};

// 9 · One tree, three kits.
export const looksLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head head head', 'poster plain term', 'body body body'], rows: ['auto', 1, 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('display', '{{$.title}}')], { align: 'end' }),
    cell('poster', [label('Poster'), text('This. A stylesheet over the kit.')], { ink: 'signal' }),
    cell('plain', [label('Plain HTML'), text('No stylesheet, no classes. The browser’s defaults.')]),
    cell('term', [label('Terminal'), text('Over SSH. The same trees, drawn in text.'), { if: '$.address.ssh', then: { component: 'Code', props: { text: '$.address.ssh' } } }], { ink: 'ink' }),
    cell('body', [sentences]),
  ],
};

// 10 · What the assistant sees: a phone, and the same screen as words.
export const screenLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick kick', 'head phone words', 'body phone words'], cols: [1.05, 0.95, 1.4], rows: ['auto', 1, 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('head', [headline('title', '{{$.title}}')], { align: 'end' }),
    cell('body', [sentences]),
    cell('phone', [label('On the phone'), phone('Leon Moreau · Waiting', [text('The assistant, open.', true)], TABS)], { pad: 'none' }),
    cell('words', [label('What the assistant is handed, abridged'), { component: 'Code', props: { text: '$.seen', marked: '$.marked' } }], { ink: 'ink' }),
  ],
};

// 11 · The model prepares, a person presses.
export const prepareLayout: LayoutNode = {
  component: 'Sheet',
  props: { size: 'fill', areas: ['kick kick form', 'water nuggets form', 'head head form', 'body body form', 'todo todo todo'], cols: [1, 1, 1], rows: ['auto', 1, 'auto', 'auto', 'auto'] },
  children: [
    cell('kick', [label('{{$.kicker}}')]),
    cell('water', [{ component: 'Figure', props: { label: 'cups of water, accepted — Taco Bell, 2025', value: '18,000' } }], { ink: 'alert', align: 'end' }),
    cell('nuggets', [{ component: 'Figure', props: { label: 'McNuggets in one order — McDonald’s and IBM, 2024', value: '260' } }], { ink: 'alert', align: 'end' }),
    cell('head', [headline('title', '{{$.title}}')]),
    cell('body', [sentences]),
    cell('form', [label('Opened by the assistant, filled in'), sendLayout, text('A person reads it, and presses Send — or does not.', true)], { ink: 'highlight' }),
    todo,
  ],
};
