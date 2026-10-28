import type { ActionDefinition, Step } from '@niscorp/nova';
import { SCREENS } from '../../screens';
import { AREAS } from '../../shell/areas';
import { dockLayout } from './dock.layout';
import { pickBackPrism, pickForwardPrism } from './dock.prism';

const shown: Step[] = AREAS.map((area) => ({ reconcile: { canvas: area, to: `$.current.canvases.${area}`, action: 'action', input: 'input', own: 'canvas' as const } }));

const closeDeck: Step = { emit: { channel: 'deck-close' } };

// The words leave the line for the chip as the question is sent, and come back to the line if it gets no screen. The
// inks the answer and the line will have are taken as it is sent: the stack counts the answer before it is finished.
const ask: Step[] = [
  closeDeck,
  { set: 'asked', from: 'text' },
  { set: 'answerInk', from: 'current.next' },
  { set: 'lineInk', from: 'current.later' },
  { set: 'text', value: '' },
  { set: 'asking', value: true },
  { set: 'error', value: '' },
  {
    call: 'ask',
    onSuccess: [{ set: 'asking', value: false }, ...shown],
    onError: [{ set: 'asking', value: false }, { set: 'error', value: '{{@error.message}}' }, { set: 'text', from: 'asked' }],
  },
];

const open: Step[] = [closeDeck, { set: 'opening', value: '@event.payload' }, { call: 'open', onSuccess: shown }];
const back: Step[] = [{ call: 'back', onSuccess: shown }];
const forward: Step[] = [{ call: 'forward', onSuccess: shown }];
const go: Step[] = [{ set: 'going', value: '@event.payload' }, { call: 'go', onSuccess: shown }];

const browse: Step[] = [
  { set: 'browse', from: 'current.position' },
  { set: 'browsing', value: true },
  { replace: { canvas: 'overview', action: 'ask.deck', input: { selected: '$.current.position' } } },
];
const pick = (picked: unknown): Step[] => [{ set: 'browse', value: { $prism: picked } }, { emit: { channel: 'deck-pick', payload: '$.browse' } }];
const deckOpen: Step[] = [{ set: 'going', from: 'browse' }, closeDeck, { call: 'go', onSuccess: shown }];

const [first] = SCREENS;

export const dockAction: ActionDefinition = {
  id: 'ask.dock',
  title: 'Dock',
  description:
    'Everything a person does, at the bottom: the chip naming the answer shown and where it stands, which opens every answer side by side; back and forward; the line to ask in; and the screens.',
  data: {
    screens: SCREENS.map(({ id, label }) => ({ id, label })),
    current: { question: '', response: '', label: first.label, screen: first.id, arrangement: first.arrangement, position: 1, total: 1, stack: [{ position: 1, label: first.label, ink: first.ink }], canvases: {}, ink: first.ink, next: 'turn-1', later: 'turn-2' },
    opening: '',
    going: 0,
    text: '',
    asked: '',
    answerInk: 'turn-1',
    lineInk: 'turn-2',
    asking: false,
    error: '',
    browsing: false,
    browse: 1,
  },
  layout: dockLayout,
  endpoints: {
    ask: { fn: 'ask', target: 'current' },
    open: { fn: 'screens.open', target: 'current' },
    back: { fn: 'answers.back', target: 'current' },
    forward: { fn: 'answers.forward', target: 'current' },
    go: { fn: 'answers.go', target: 'current' },
    current: { fn: 'answers.current', target: 'current' },
  },
  lifecycle: { mount: [{ call: 'current', onSuccess: shown }] },
  triggers: [
    { message: 'answer-moved', do: [{ call: 'current', onSuccess: shown }] },
    { message: 'ask', do: [{ set: 'text', value: '@event.payload' }, ...ask] },
    { message: 'open', do: open },
    { message: 'go', do: go },
    { message: 'deck-selected', do: [{ set: 'browse', value: '@event.payload' }] },
    { message: 'deck-closed', do: [{ set: 'browsing', value: false }] },
    { message: 'answer-closed', do: [{ call: 'current', onSuccess: shown }] },
    { event: 'ui:key', key: 'Enter', ref: 'text', do: ask },
    { event: 'ui:click', ref: 'send', do: ask },
    { event: 'ui:click', ref: 'screen', do: open },
    { event: 'ui:click', ref: 'back', do: back },
    { event: 'ui:click', ref: 'forward', do: forward },
    { event: 'ui:key', ref: 'keys', key: 'ArrowLeft', do: back },
    { event: 'ui:key', ref: 'keys', key: 'ArrowRight', do: forward },
    { event: 'ui:click', ref: 'chip', do: browse },
    { event: 'ui:click', ref: 'deck-back', do: pick(pickBackPrism) },
    { event: 'ui:click', ref: 'deck-forward', do: pick(pickForwardPrism) },
    { event: 'ui:click', ref: 'chip-open', do: deckOpen },
    { event: 'ui:key', ref: 'deck-keys', key: 'ArrowLeft', do: pick(pickBackPrism) },
    { event: 'ui:key', ref: 'deck-keys', key: 'ArrowRight', do: pick(pickForwardPrism) },
    { event: 'ui:key', ref: 'deck-keys', key: 'Enter', do: deckOpen },
    { event: 'ui:key', ref: 'deck-keys', key: 'Escape', do: [closeDeck] },
    { event: 'ui:key', ref: 'deck-keys', key: 'Delete', do: [{ emit: { channel: 'deck-close-picked' } }] },
  ],
};
