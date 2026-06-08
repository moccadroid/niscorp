import { useCallback, useEffect, useMemo, useState, Fragment, type FC, type ComponentType, type ReactNode } from 'react';
import { Sidebar as ChromeSidebar, type SidebarDoc } from './chrome/sidebar';
import { CanvasPane as ChromeCanvasPane } from './chrome/canvas-pane';
import { ChromeInspector } from './chrome/inspector';
import { LibrarySwitcher, type Library } from './chrome/library-switcher';
import { DocPane } from './chrome/doc-pane';
import { MarkdownPane } from './chrome/markdown-pane';
import { SourceTab } from './chrome/source-tab';
import { useIsMobile } from './chrome/use-is-mobile';
import type { DocPage, InspectorTabDef, LibraryModule, Story } from './modules/types';

import startContent from '../../../README.md?raw';

type LibraryDef = {
  id: string;
  name: string;
  load: () => Promise<LibraryModule>;
};

// Display order: Signal → Solid → Prism → Nova → Cortex follows the
// LLM-stack mental model (talk to the model → parse the stream →
// transform JSON → render UI → orchestrate).
const LIBRARIES: LibraryDef[] = [
  { id: 'signal', name: 'Signal', load: async () => (await import('./modules/signal')).signalModule },
  { id: 'solid', name: 'Solid', load: async () => (await import('./modules/solid')).solidModule },
  { id: 'prism', name: 'Prism', load: async () => (await import('./modules/prism')).prismModule },
  { id: 'vex', name: 'Vex', load: async () => (await import('./modules/vex')).vexModule },
  { id: 'nova', name: 'Nova', load: async () => (await import('./modules/nova')).novaModule },
  { id: 'cortex', name: 'Cortex', load: async () => (await import('./modules/cortex')).cortexModule },
];

// 'start' is a chrome-level landing page that renders the repo's
// root README directly — no sidebar, no inspector. Not a LibraryDef.
const START_ID = 'start';
const LIBRARY_TABS: Library[] = [
  { id: START_ID, name: 'Start' },
  ...LIBRARIES.map((l) => ({ id: l.id, name: l.name })),
];

const DOC_PREFIX = 'doc:';
const docId = (id: string): string => `${DOC_PREFIX}${id}`;
const isDocSelection = (id: string): boolean => id.startsWith(DOC_PREFIX);
const stripDocPrefix = (id: string): string => id.slice(DOC_PREFIX.length);

const PassThroughProvider: ComponentType<{ children: ReactNode }> = ({ children }) => (
  <Fragment>{children}</Fragment>
);

// Semi-transparent click-away layer behind mobile drawers.
const Backdrop: FC<{ onClick: () => void }> = ({ onClick }) => (
  <div
    onClick={onClick}
    style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(17, 24, 39, 0.45)',
      zIndex: 40,
    }}
  />
);

export const App: FC = () => {
  const [activeLibraryId, setActiveLibraryId] = useState<string>(START_ID);
  const [active, setActive] = useState<LibraryModule | undefined>(undefined);
  const [activeStoryId, setActiveStoryId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (activeLibraryId === START_ID) {
      setActive(undefined);
      setActiveStoryId('');
      return;
    }
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

  // Crossing the breakpoint in either direction clears drawer state
  // so the desktop layout isn't left with a stale "open" flag and a
  // mobile user switching libraries doesn't reopen something they
  // dismissed.
  useEffect(() => {
    setSidebarOpen(false);
    setInspectorOpen(false);
  }, [isMobile, activeLibraryId]);

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

  // Selecting a story/doc on mobile should close the drawer so the
  // user can see the canvas. Desktop is unchanged.
  const onStorySelect = useCallback((id: string): void => {
    setActiveStoryId(id);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  if (activeLibraryId === START_ID) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LibrarySwitcher
          libraries={LIBRARY_TABS}
          activeId={activeLibraryId}
          onSelect={setActiveLibraryId}
        />
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#ffffff' }}>
          <MarkdownPane content={startContent} />
        </div>
      </div>
    );
  }

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

  // On mobile: sidebar is visible only when explicitly opened.
  // Inspector is shown only when opened AND the current view has
  // tabs (docs have none).
  const showSidebar = !isMobile || sidebarOpen;
  const hasInspector = inspectorTabs.length > 0;
  const showInspector = hasInspector && (!isMobile || inspectorOpen);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LibrarySwitcher
        libraries={LIBRARY_TABS}
        activeId={activeLibraryId}
        onSelect={setActiveLibraryId}
        onMenuClick={isMobile ? () => setSidebarOpen((v) => !v) : undefined}
        onInspectorClick={isMobile && hasInspector ? () => setInspectorOpen((v) => !v) : undefined}
      />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, minWidth: 0, position: 'relative' }}>
        {isMobile && sidebarOpen && <Backdrop onClick={() => setSidebarOpen(false)} />}
        {showSidebar && (
          <ChromeSidebar
            title="Nisc Showroom"
            stories={sidebarEntries}
            activeStoryId={activeStoryId}
            onSelect={onStorySelect}
            kindOrder={[...active.kindOrder]}
            kindLabels={active.kindLabels}
            docs={sidebarDocs}
            isMobile={isMobile}
            onClose={() => setSidebarOpen(false)}
          />
        )}
        {activeDocPage !== undefined ? (
          <DocPane page={activeDocPage} />
        ) : (
          <RuntimeProvider>
            <ChromeCanvasPane
              name={activeStory?.name ?? ''}
              description={activeStory?.description ?? ''}
              isMobile={isMobile}
            >
              {Demo !== undefined && <Demo />}
            </ChromeCanvasPane>
            {isMobile && inspectorOpen && hasInspector && (
              <Backdrop onClick={() => setInspectorOpen(false)} />
            )}
            {showInspector && (
              <ChromeInspector
                tabs={inspectorTabs}
                isMobile={isMobile}
                onClose={() => setInspectorOpen(false)}
              />
            )}
          </RuntimeProvider>
        )}
      </div>
    </div>
  );
};
