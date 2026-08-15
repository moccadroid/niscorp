import type { DocPage, LibraryModule } from '@showroom/modules/types';
import { stories } from './stories';
import { buildInspectorTabs } from './inspector-tabs/build-tabs';

import readmeContent from '../../../../../packages/nova/README.md?raw';
import designContent from '../../../../../packages/nova/DESIGN.md?raw';
import layoutDocsContent from '../../../../../packages/nova/LAYOUT_DOCS.md?raw';
import actionDocsContent from '../../../../../packages/nova/ACTION_DOCS.md?raw';
import shellDocsContent from '../../../../../packages/nova/SHELL_DOCS.md?raw';
import reactDocsContent from '../../../../../packages/nova/REACT_DOCS.md?raw';
import i18nDocsContent from '../../../../../packages/nova/I18N_DOCS.md?raw';

const docs: readonly DocPage[] = [
  { id: 'readme', title: 'README', content: readmeContent },
  { id: 'design', title: 'Design', content: designContent },
  { id: 'layout', title: 'Layout Guide', content: layoutDocsContent },
  { id: 'action', title: 'Action Guide', content: actionDocsContent },
  { id: 'shell', title: 'Shell Guide', content: shellDocsContent },
  { id: 'react', title: 'React Guide', content: reactDocsContent },
  { id: 'i18n', title: 'i18n Guide', content: i18nDocsContent },
];

const KIND_ORDER: readonly string[] = ['layout', 'action', 'shell', 'i18n'];

const KIND_LABELS: Record<string, string> = {
  layout: 'Layouts',
  action: 'Actions',
  shell: 'Shells',
  i18n: 'i18n',
};

export const novaModule: LibraryModule = {
  id: 'nova',
  name: 'Nova',
  stories,
  kindOrder: KIND_ORDER,
  kindLabels: KIND_LABELS,
  buildInspectorTabs,
  docs,
};
