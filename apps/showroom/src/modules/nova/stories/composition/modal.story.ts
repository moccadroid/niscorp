import * as demo from './modal.demo';
import source from './modal.demo?raw';

export const story = {
  id: 'compose-modal',
  name: 'Modal pattern',
  description:
    'Putting it together: a modal is just an action pushed onto a dedicated `modal` canvas, composed `with: [\'modal\']`. The fragment carries all the chrome as data (backdrop, card, header, footer, close/cancel wiring); the pushed `new-contact` form supplies only the body and `confirm`. The lone bit of real code is a small `Overlay` primitive that positions the dimmed layer — everything else is serializable. Click “New contact”; ✕ / Cancel / backdrop close it, Create confirms (and counts).',
  category: 'Composition',
  kind: 'action' as const,
  ...demo,
  source,
};
