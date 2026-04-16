import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';
import { CortexRuntimeProvider } from './runtime-context';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';

import designContent from '../../../../../packages/cortex/DESIGN.md?raw';

const docs: readonly DocPage[] = [{ id: 'design', title: 'Design', content: designContent }];

const KIND_ORDER: readonly string[] = ['standalone', 'tool-use', 'plan-mode', 'rules', 'confirmation'];
const KIND_LABELS: Record<string, string> = {
  standalone: 'STANDALONE EXECUTION',
  'tool-use': 'TOOL USE',
  'plan-mode': 'PLAN MODE (TICK LOOP)',
  rules: 'RULES ENGINE',
  confirmation: 'HUMAN IN THE LOOP',
};

export const cortexModule: LibraryModule = {
  id: 'cortex',
  name: 'Cortex',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  buildInspectorTabs,
  RuntimeProvider: CortexRuntimeProvider,
  docs,
};
