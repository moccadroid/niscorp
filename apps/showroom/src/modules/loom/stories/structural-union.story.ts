import * as demo from './structural-union.demo';
import source from './structural-union.demo?raw';

export const story = {
  id: 'structural-union',
  name: 'Structural union',
  description:
    'A plain union with no shared discriminant — each branch is identified by which key it carries (`paragraph` / `imageUrl` / `heading`). Loom discriminates by presence: the chooser compiles to one `$exists` branch per variant, and switching resets the document to the new branch’s defaults. The same chooser as the tagged union, only the match differs — this is what unlocks editing the stack’s own structurally-tagged schemas. See the Definition tab.',
  category: 'Structure',
  kind: 'structure' as const,
  ...demo,
  source,
};
