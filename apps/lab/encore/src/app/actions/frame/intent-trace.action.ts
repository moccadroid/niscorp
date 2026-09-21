import type { ActionDefinition } from '@niscorp/nova';
import { TRACE_TABS, intentTraceLayout } from './intent-trace.layout';

// X-RAY — the one panel (intent-trace.layout.ts). `open` IS x-ray: this card's own
// data, flipped by its own button, the backtick key, and — once per page load, so
// nobody ever lands in somebody else's x-ray — the kit's `OnLoad`. Nothing else in
// the room knows whether it is open, and nothing else changes when it is.
//
// The loop writes two things here. The pass AS MEASURED (`pass`, `lanes`, `top`,
// `handoff`, `run` — raw, never drawn; what the checks read), and THE STORY the
// panel draws (`story`, and where it sits among the last few: `storyPosition`,
// `hasEarlier`, `hasLater`, `following`). Which tab is showing and whether every
// card is listed are the card's own, and survive every pass.
// Announced when the panel opens or shuts, for the one other thing that lives in
// it: the director's deck is its own action (its own grant), drawn in the panel's
// "Demo" section — and, like everything else about x-ray, not even sent while the
// panel is shut.
export const XRAY_CHANNEL = 'xray-open';

export const intentTraceAction: ActionDefinition = {
  id: 'intent.trace',
  title: 'X-ray',
  description: 'How the room decided: the story of the last pass — what was typed, what the fast model decided, what the assistant was handed and said, what was refused and why, what changed on screen — then timings and cost, and the demo controls.',
  data: {
    open: false,
    tab: 'story',
    allCards: false,
    command: 'latest',
    story: {},
    storyPosition: '',
    hasEarlier: false,
    hasLater: false,
    following: true,
    pass: 0,
    text: '',
    questions: 0,
    bytes: 0,
    decider: '',
    calibrated: false,
    lanes: [],
    totalMs: 0,
    waitedMs: 0,
    connection: '',
    warm: '',
    top: [],
    handoff: [],
    run: [],
  },
  layout: intentTraceLayout,
  endpoints: { step: { fn: 'encore.story', target: 'storyPosition' } },
  triggers: [
    ...['open', 'openKey'].map((ref) => ({ event: 'ui:click' as const, ref, do: [{ set: 'open', value: true }, { emit: { channel: XRAY_CHANNEL, payload: true } }] })),
    // `fresh` is a RESET, not a toggle: two pages loading at once must not turn it back on.
    ...['shut', 'shutKey', 'fresh'].map((ref) => ({ event: 'ui:click' as const, ref, do: [{ set: 'open', value: false }, { emit: { channel: XRAY_CHANNEL, payload: false } }] })),
    ...TRACE_TABS.map((tab) => ({ event: 'ui:click' as const, ref: `tab-${tab}`, do: [{ set: 'tab', value: tab }] })),
    { event: 'ui:click', ref: 'allCards', do: [{ set: 'allCards', value: true }] },
    { event: 'ui:click', ref: 'fewerCards', do: [{ set: 'allCards', value: false }] },
    ...['earlier', 'later', 'latest'].map((command) => ({ event: 'ui:click' as const, ref: command, do: [{ set: 'command', value: command }, { call: 'step' }] })),
  ],
};
