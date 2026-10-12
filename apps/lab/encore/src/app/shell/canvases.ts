import type { ShellManifest } from '@niscorp/moss';
import type { LayoutNode } from '@niscorp/nova';
import { QUESTION_CANVASES } from '@encore/app/canvas-placement';

const tray: LayoutNode = { for: '$.instances', as: 'card', key: 'id', do: { component: 'ActionSlot', props: { instanceId: '$.card.id' } } };

export const CANVASES: ShellManifest['canvases'] = [
  { id: 'line', initial: 'intent.line' },
  ...QUESTION_CANVASES.map((id) => ({ id, mode: 'list' as const, actionLayout: tray })),
  { id: 'assist', mode: 'list', actionLayout: tray },
  { id: 'rail', mode: 'list', actionLayout: tray, initial: 'assist.rail' },
  { id: 'maybe', mode: 'list', actionLayout: tray, initial: 'intent.options' },
  { id: 'watch', mode: 'list', actionLayout: tray, initial: 'attention.strip' },
  { id: 'attention', mode: 'list', actionLayout: tray },
  { id: 'deck', mode: 'list', actionLayout: tray, initial: 'director.deck' },
  { id: 'warm', mode: 'list', actionLayout: tray },
  { id: 'trace', mode: 'list', actionLayout: tray, initial: 'intent.trace' },
];
