import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';
import { buildInspectorTabs } from './inspector-tabs';
import { VexRuntimeProvider } from './runtime-context';
import {
  KIND_BASICS,
  KIND_DSL,
  KIND_SHAPE,
  KIND_SEARCH,
  KIND_SCOPE,
  KIND_MUTATIONS,
  KIND_SAFETY,
  KIND_CACHING,
} from './scenarios';

import readmeContent from '../../../../../packages/vex/README.md?raw';
import designContent from '../../../../../packages/vex/DESIGN.md?raw';
import docsContent from '../../../../../packages/vex/DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'reference', title: 'Reference', content: docsContent },
];

const KIND_ORDER: readonly string[] = [
  KIND_BASICS,
  KIND_DSL,
  KIND_SHAPE,
  KIND_SEARCH,
  KIND_SCOPE,
  KIND_MUTATIONS,
  KIND_SAFETY,
  KIND_CACHING,
];

const KIND_LABELS: Record<string, string> = {
  [KIND_BASICS]: 'Basics',
  [KIND_DSL]: 'The DSL',
  [KIND_SHAPE]: 'Shaping',
  [KIND_SEARCH]: 'Search',
  [KIND_SCOPE]: 'Scope',
  [KIND_MUTATIONS]: 'Mutations',
  [KIND_SAFETY]: 'Safety',
  [KIND_CACHING]: 'Caching',
};

export const vexModule: LibraryModule = {
  id: 'vex',
  name: 'Vex',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  buildInspectorTabs,
  RuntimeProvider: VexRuntimeProvider,
  docs,
};
