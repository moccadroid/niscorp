import { useEffect, useMemo, useState, Fragment, type FC, type ComponentType, type ReactNode } from 'react';
import { Sidebar as ChromeSidebar, type SidebarDoc } from './chrome/sidebar';
import { CanvasPane as ChromeCanvasPane } from './chrome/canvas-pane';
import { ChromeInspector } from './chrome/inspector';
import { LibrarySwitcher, type Library } from './chrome/library-switcher';
import { DocPane } from './chrome/doc-pane';
import { SourceTab } from './chrome/source-tab';
import type { DocPage, InspectorTabDef, LibraryModule, Story } from './modules/types';

type LibraryDef = {
  id: string;
  name: string;
  load: () => Promise<LibraryModule>;
};

const LIBRARIES: LibraryDef[] = [
  { id: 'prism', name: 'Prism', load: async () => (await import('./modules/prism')).prismModule },
  { id: 'solid', name: 'Solid', load: async () => (await import('./modules/solid')).solidModule },
  { id: 'nova', name: 'Nova', load: async () => (await import('./modules/nova')).novaModule },
  { id: 'signal', name: 'Signal', load: async () => (await import('./modules/signal')).signalModule },
  { id: 'cortex', name: 'Cortex', load: async () => (await import('./modules/cortex')).cortexModule },
];

const LIBRARY_TABS: Library[] = LIBRARIES.map((l) => ({ id: l.id, name: l.name }));

const DOC_PREFIX = 'doc:';
const docId = (id: string): string => `${DOC_PREFIX}${id}`;
const isDocSelection = (id: string): boolean => id.startsWith(DOC_PREFIX);
const stripDocPrefix = (id: string): string => id.slice(DOC_PREFIX.length);

const PassThroughProvider: ComponentType<{ children: ReactNode }> = ({ children }) => (
  <Fragment>{children}</Fragment>
);

export const App: FC = () => {
  const [activeLibraryId, setActiveLibraryId] = useState<string>('nova');
  const [active, setActive] = useState<LibraryModule | undefined>(undefined);
  const [activeStoryId, setActiveStoryId] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const lib = LIBRARIES.find((l) => l.id === activeLibraryId);
    if (lib === undefined) return;
    void lib.load().then((mod) => {
      if (cancelled) return;
      setActive(mod);
      const firstDoc = mod.docs?.[0];
      if (firstDoc !== undefined) {
        setActiveStoryId(docId(firstDoc.id));
        return;
      }
      const firstStory = mod.stories[0];
      setActiveStoryId(firstStory?.id ?? '');
    });
    return (): void => {
      cancelled = true;
    };
  }, [activeLibraryId]);

  const sidebarEntries = useMemo(() => {
    if (active === undefined) return [];
    return active.stories.map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
      kind: s.kind,
    }));
  }, [active]);

  const sidebarDocs = useMemo<SidebarDoc[]>(() => {
    if (active?.docs === undefined) return [];
    return active.docs.map((d) => ({ id: docId(d.id), title: d.title }));
  }, [active]);

  if (active === undefined) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  const activeDocPage: DocPage | undefined = isDocSelection(activeStoryId)
    ? active.docs?.find((d) => d.id === stripDocPrefix(activeStoryId))
    : undefined;

  const activeStory: Story | undefined = activeDocPage === undefined
    ? active.stories.find((s) => s.id === activeStoryId)
    : undefined;

  // Chrome contributes the Source tab for every story. Modules can
  // add extras via buildInspectorTabs.
  const inspectorTabs: InspectorTabDef[] = activeStory === undefined
    ? []
    : [
        { id: 'source', label: 'Source', render: () => <SourceTab story={activeStory} /> },
        ...(active.buildInspectorTabs?.(activeStory) ?? []),
      ];

  const RuntimeProvider = active.RuntimeProvider ?? PassThroughProvider;
  const Demo = activeStory?.Demo;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LibrarySwitcher
        libraries={LIBRARY_TABS}
        activeId={activeLibraryId}
        onSelect={setActiveLibraryId}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <ChromeSidebar
          title="Nisc Showroom"
          stories={sidebarEntries}
          activeStoryId={activeStoryId}
          onSelect={setActiveStoryId}
          kindOrder={[...active.kindOrder]}
          kindLabels={active.kindLabels}
          docs={sidebarDocs}
        />
        {activeDocPage !== undefined ? (
          <DocPane page={activeDocPage} />
        ) : (
          <RuntimeProvider>
            <ChromeCanvasPane
              name={activeStory?.name ?? ''}
              description={activeStory?.description ?? ''}
            >
              {Demo !== undefined && <Demo />}
            </ChromeCanvasPane>
            <ChromeInspector tabs={inspectorTabs} />
          </RuntimeProvider>
        )}
      </div>
    </div>
  );
};
