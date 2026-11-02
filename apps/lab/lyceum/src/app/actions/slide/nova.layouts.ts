import type { LayoutNode } from '@niscorp/nova';

// The Nova talk's slides (talks/nova.md): one short sentence each, in the
// display font; anything a person types is in the code font, as written.
const cell = (area: string, children: LayoutNode[], props: Record<string, unknown> = {}): LayoutNode => ({ component: 'Cell', props: { area, ...props }, children });
const headline = (level: 'display' | 'title' | 'name', words: string): LayoutNode => ({ component: 'Headline', props: { level }, children: words });
const text = (words: string, size?: 'lede' | 'small'): LayoutNode => ({ component: 'Text', ...(size === undefined ? {} : { props: { size } }), children: words });
const label = (words: string): LayoutNode => ({ component: 'Label', children: words });
const code = (at: string): LayoutNode => ({ component: 'Code', props: { text: at } });
const demo: LayoutNode = { component: 'CanvasSlot', props: { canvasId: 'demo' } };
const sheet = (areas: string[], cols: number[], rows: (number | 'auto')[], children: LayoutNode[]): LayoutNode => ({ component: 'Sheet', props: { size: 'fill', areas, cols, rows }, children });
const head = (): LayoutNode => cell('head', [headline('display', '{{$.title}}')]);
const pane = (caption: string, at: string, lang?: 'json' | 'ts', extra: Record<string, unknown> = {}): LayoutNode => ({ component: 'Exhibit', props: { label: caption, text: at, ...(lang === undefined ? {} : { lang }), tone: 'ink', ...extra } });
// From this step of the slide on.
const from = (step: number, then: LayoutNode): LayoutNode => ({ if: { $prism: { $gte: [{ $ref: '$.step.step' }, { $const: step }] } }, then });
const at = (step: number, then: LayoutNode, otherwise: LayoutNode): LayoutNode => ({ if: { $prism: { $eq: [{ $ref: '$.step.step' }, { $const: step }] } }, then, else: otherwise });

export const novaTitleLayout: LayoutNode = sheet(['head join', 'install join'], [1.5, 1], [1, 'auto'], [
  cell('head', [headline('display', '{{$.title}}'), headline('title', '{{$.line}}')], { align: 'middle' }),
  cell('install', [code('$.install')], { ink: 'ink' }),
  cell('join', [label('Join'), { component: 'Qr', props: { value: '$.address.url' } }, code('$.address.host')], { align: 'middle' }),
]);

// A screen is code: the three things that follow, one at a time.
export const codeLayout: LayoutNode = sheet(['head', 'who', 'where', 'change'], [1], ['auto', 1, 1, 1], [
  head(),
  from(1, cell('who', [headline('title', '{{$.who}}')], { align: 'middle' })),
  from(2, cell('where', [headline('title', '{{$.where}}')], { align: 'middle' })),
  from(3, cell('change', [headline('title', '{{$.change}}')], { align: 'middle' })),
]);

// The form everybody has, beside its whole document; then each part as it is named, on its own.
const partPane = (part: string): LayoutNode => pane(`questions.send · ${part}`, `$.form.document.part.${part}`, 'json', { fit: true });
export const documentLayout: LayoutNode = sheet(['head head', 'form doc'], [0.6, 1.4], ['auto', 1], [
  head(),
  cell('form', [demo], { align: 'middle' }),
  cell('doc', [at(1, partPane('data'), at(2, partPane('layout'), at(3, partPane('triggers'), at(4, partPane('endpoints'), pane('questions.send', '$.form.document.code', 'json', { fit: true })))))], { align: 'middle' }),
]);


// The form X-rayed, beside what a model reads of it: what was typed, large, then the rest of its document.
export const readLayout: LayoutNode = sheet(['head head', 'form typed', 'form rest'], [0.6, 1.4], ['auto', 'auto', 1], [
  head(),
  cell('form', [demo], { align: 'middle', xray: true }),
  cell('typed', [pane('questions.send — what was typed', '$.form.read.data', 'json')]),
  cell('rest', [pane('…and the rest of it: what each part is and does', '$.form.read.rest', 'json', { fit: true })]),
]);

// The form, the request, and the lines the new layout changed; while the model writes, the stripes under the request move.
export const modelLayout: LayoutNode = sheet(['head head', 'form asked', 'form layout'], [0.6, 1.4], ['auto', 'auto', 1], [
  head(),
  cell('form', [demo], { align: 'middle' }),
  {
    if: '$.form.last.writing',
    then: cell('asked', [label('Writing a layout'), headline('title', '“{{$.form.last.request}}”'), { component: 'Cell', props: { mark: 'stripes' }, children: [] }], { ink: 'highlight' }),
    else: {
      if: '$.form.last.request',
      then: cell('asked', [headline('title', '“{{$.form.last.request}}”'), { if: '$.form.last.said', then: text('Not taken: {{$.form.last.said}}') }], { ink: 'signal' }),
      else: cell('asked', [headline('title', 'Say how the form should look.')], { ink: 'signal' }),
    },
  },
  { if: '$.form.last.how', then: cell('layout', [pane('The form’s layout now', '$.form.layout.code', 'json', { marked: '$.form.layout.marked', fit: true })], { align: 'middle' }), else: cell('layout', []) },
]);

export const brokenLayout: LayoutNode = sheet(['head head', 'layout said'], [1.1, 0.9], ['auto', 1], [
  head(),
  cell('layout', [pane('A layout with two mistakes', '$.form.broken.code', 'json', { marked: '$.form.broken.marked', fit: true })], { align: 'middle' }),
  {
    if: '$.form.broken.said',
    then: cell('said', [headline('title', 'Refused. Nobody’s form changed.'), text('{{$.form.broken.said}}')], { ink: 'alert', align: 'middle' }),
    else: cell('said', [headline('title', 'A button nothing answers, and a line reading data that isn’t there.')], { mark: 'hatch', align: 'middle' }),
  },
]);

export const strangerLayout: LayoutNode = sheet(['head head', 'checks answer'], [1, 1.2], ['auto', 1], [
  head(),
  cell('checks', [{ component: 'Rows', props: { rows: '$.vendor.checks', rowKey: 'check', empty: '', columns: [{ label: 'Checked before it can be approved', key: 'check', w: 4 }, { label: '', key: 'passed', kind: 'sigil', w: 0.6, missing: '' }] } }], { pad: 'none', align: 'middle' }),
  cell('answer', [
    label('Applause’s file'),
    code('$.vendor.url'),
    { if: { $eq: ['$.vendor.status', 'not installed'] }, then: headline('title', 'Not installed yet.') },
    { if: { $eq: ['$.vendor.status', 'refused'] }, then: headline('title', 'Refused.') },
    { if: { $eq: ['$.vendor.status', 'pending'] }, then: headline('title', 'Passed. Waiting for approval.') },
    // Approved, its own screen for the projector is drawn here, and its Clap button is on every phone.
    { if: { $eq: ['$.vendor.status', 'approved'] }, then: { component: 'CanvasSlot', props: { canvasId: 'attached' } } },
  ], { align: 'middle' }),
]);

export const drawLayout: LayoutNode = sheet(['head head', 'picks ssh'], [1.15, 0.85], ['auto', 1], [
  head(),
  cell('picks', [label('What draws your phone'), { component: 'Stats', props: { items: '$.picks.items' } }], { align: 'middle' }),
  cell('ssh', [label('Or join from a terminal'), code('$.address.ssh')], { ink: 'ink', align: 'middle' }),
]);

export const writeLayout: LayoutNode = sheet(['head head', 'names source'], [0.8, 1.2], ['auto', 1], [
  head(),
  cell('names', [label('Your components'), code('$.form.kit.names')], { align: 'middle' }),
  cell('source', [pane('Action, as this talk draws it', '$.form.kit.button', 'ts')], { align: 'middle' }),
]);

export const novaEndLayout: LayoutNode = sheet(['head', 'where'], [1], ['auto', 1], [
  head(),
  cell('where', [code('$.where'), text('{{$.examples}}', 'lede')], { ink: 'signal', align: 'middle' }),
]);

export const questionsLayout: LayoutNode = sheet(['head', 'question', 'ask'], [1], ['auto', 1, 'auto'], [
  head(),
  {
    if: '$.onScreen.0.text',
    then: cell('question', [headline('title', '{{$.onScreen.0.text}}')], { align: 'middle' }),
    else: cell('question', [headline('title', 'Ask on your phone.')], { mark: 'hatch', align: 'middle' }),
  },
  cell('ask', [label('Join'), code('$.address.host')], { ink: 'signal' }),
]);
