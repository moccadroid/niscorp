import type { ActionDefinition } from '@niscorp/nova';
import { questionSendAction } from '@lyceum/app/actions/questions/send.action';
import { FORM_CHANGED } from '@lyceum/app/actions/screens/screens';
import { deckStep } from '@lyceum/app/vex/deck.entries';
import { questionOnScreen } from '@lyceum/app/vex/question.entries';
import { allPicks } from '@lyceum/app/vex/renderer.entries';
import { layersLit, mapLayout } from './map.layout';
import {
  brokenLayout,
  codeLayout,
  documentLayout,
  drawLayout,
  modelLayout,
  novaEndLayout,
  novaTitleLayout,
  questionsLayout,
  readLayout,
  strangerLayout,
  writeLayout,
} from './nova.layouts';

// The Nova talk (talks/nova.md). What the slides show of the Q&A form is the
// server's (`room.form`); a slide that draws the form puts it in the
// projector's `demo` canvas.
const FORM = {
  document: { code: '', part: { data: '', layout: '', triggers: '', endpoints: '' } },
  layout: { code: '', marked: [] },
  last: { request: '', how: '', attempts: 0, writing: false, said: '' },
  broken: { code: '', marked: [], said: '' },
  read: { data: '', rest: '' },
  kit: { names: '', button: '' },
};
const ADDRESS = { url: '', host: '', ssh: '' };
const STEP = { step: 0, parts: 1, part: 1 };
const read = [{ call: 'form' }];

const withForm = (id: string, title: string, layout: ActionDefinition['layout'], options: { drawn?: boolean; address?: boolean; stepped?: boolean } = {}): ActionDefinition => ({
  id,
  title,
  data: { title, form: FORM, ...(options.address === true ? { address: ADDRESS } : {}), ...(options.stepped === true ? { step: STEP } : {}) },
  layout,
  endpoints: {
    form: { fn: 'room.form', target: 'form' },
    ...(options.address === true ? { address: { fn: 'room.address', target: 'address' } } : {}),
    ...(options.stepped === true ? { step: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' } } : {}),
  },
  lifecycle: {
    mount: [
      ...(options.drawn === true ? [{ resetTo: { action: questionSendAction.id, canvas: 'demo' } }] : []),
      ...read,
      ...(options.address === true ? [{ call: 'address' }] : []),
      ...(options.stepped === true ? [{ call: 'step' }] : []),
    ],
  },
  triggers: [{ message: FORM_CHANGED, do: read }],
});

const still = (id: string, title: string, layout: ActionDefinition['layout'], data: Record<string, unknown> = {}): ActionDefinition => ({ id, title, data: { title, ...data }, layout, triggers: [] });

const readVendor = [{ call: 'vendor' }];

export const NOVA_SLIDE_ACTIONS: readonly ActionDefinition[] = [
  {
    id: 'slide.nova-title',
    title: 'Nova',
    data: { title: 'Nova', line: 'The screen is a document.', install: '$ pnpm add @niscorp/nova @niscorp/prism \\\n    @niscorp/strata zod', address: ADDRESS },
    layout: novaTitleLayout,
    endpoints: { address: { fn: 'room.address', target: 'address' } },
    lifecycle: { mount: [{ call: 'address' }] },
    triggers: [],
  },
  still('slide.nova-map', 'Nova is where nisc draws.', mapLayout, { layers: layersLit('Nova'), detailed: false }),
  {
    id: 'slide.nova-code',
    title: 'A screen is code.',
    data: { title: 'A screen is code.', who: 'Only someone who writes code can write it.', where: 'It runs where it was built for.', change: 'To change it, you ship.', step: STEP },
    layout: codeLayout,
    endpoints: { step: { url: '/api/vex', method: 'POST', request: { fingerprint: deckStep.fingerprint, context: {} }, target: 'step' } },
    lifecycle: { mount: [{ call: 'step' }] },
    triggers: [],
  },
  withForm('slide.nova-document', 'This one isn’t.', documentLayout, { drawn: true, stepped: true }),
  withForm('slide.nova-read', 'It can read all of it.', readLayout, { drawn: true }),
  withForm('slide.nova-model', 'A model can write it.', modelLayout, { drawn: true }),
  withForm('slide.nova-broken', 'It can’t break it.', brokenLayout),
  {
    id: 'slide.nova-stranger',
    title: 'Someone else can write it.',
    data: { title: 'Someone else can write it.', integration: 'applause', vendor: { id: '', url: '', status: '', reasons: [], checks: [], culprit: '' } },
    layout: strangerLayout,
    endpoints: { vendor: { fn: 'integrations.state', target: 'vendor' } },
    lifecycle: { mount: readVendor },
    triggers: [{ message: 'integration-changed', do: readVendor }],
  },
  {
    id: 'slide.nova-draw',
    title: 'Anything can draw it.',
    data: { title: 'Anything can draw it.', picks: { items: [] }, address: ADDRESS },
    layout: drawLayout,
    endpoints: {
      picks: { url: '/api/vex', method: 'POST', request: { fingerprint: allPicks.fingerprint, context: {} }, target: 'picks' },
      address: { fn: 'room.address', target: 'address' },
    },
    lifecycle: { mount: [{ call: 'picks' }, { call: 'address' }] },
    triggers: [],
  },
  withForm('slide.nova-write', 'What you still write.', writeLayout),
  still('slide.nova-layer', 'That was one layer.', mapLayout, { layers: layersLit('Nova'), detailed: true }),
  still('slide.nova-end', 'nisc.dev/nova', novaEndLayout, { where: 'nisc.dev/nova', examples: 'The guides, the reference, and forty-two examples you can press.' }),
  {
    id: 'slide.nova-questions',
    title: 'Your questions.',
    data: { title: 'Your questions.', onScreen: [], address: ADDRESS },
    layout: questionsLayout,
    endpoints: {
      address: { fn: 'room.address', target: 'address' },
      onScreen: { url: '/api/vex', method: 'POST', request: { fingerprint: questionOnScreen.fingerprint, context: {} }, target: 'onScreen' },
    },
    lifecycle: { mount: [{ call: 'address' }, { call: 'onScreen' }] },
    triggers: [],
  },
];
