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
import {
  START_ID,
  docId,
  isDocSelection,
  stripDocPrefix,
  initialRoute,
  routeSegments,
  buildPath,
  resolvePage,
  samePath,
} from './routing';

import startContent from '../../../README.md?raw';

type LibraryDef = {
  id: string;
  name: string;
  load: () => Promise<LibraryModule>;
};

const LIBRARIES: LibraryDef[] = [
  { id: 'signal', name: 'Signal', load: async () => (await import('./modules/signal')).signalModule },
  { id: 'solid', name: 'Solid', load: async () => (await import('./modules/solid')).solidModule },
  { id: 'prism', name: 'Prism', load: async () => (await import('./modules/prism')).prismModule },
  { id: 'charter', name: 'Charter', load: async () => (await import('./modules/charter')).charterModule },
  { id: 'moss', name: 'Moss', load: async () => (await import('./modules/moss')).mossModule },
  { id: 'vex', name: 'Vex', load: async () => (await import('./modules/vex')).vexModule },
  { id: 'tide', name: 'Tide', load: async () => (await import('./modules/tide')).tideModule },
  { id: 'strata', name: 'Strata', load: async () => (await import('./modules/strata')).strataModule },
  { id: 'nova', name: 'Nova', load: async () => (await import('./modules/nova')).novaModule },
  { id: 'cortex', name: 'Cortex', load: async () => (await import('./modules/cortex')).cortexModule },
  { id: 'loom', name: 'Loom', load: async () => (await import('./modules/loom')).loomModule },
];

const LIBRARY_TABS: Library[] = [
  { id: START_ID, name: 'Start' },
  ...LIBRARIES.map((l) => ({ id: l.id, name: l.name })),
];

const PassThroughProvider: ComponentType<{ children: ReactNode }> = ({ children }) => (
  <Fragment>{children}</Fragment>
);

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
  const initial = useMemo(initialRoute, []);
  const [activeLibraryId, setActiveLibraryId] = useState<string>(initial.libraryId);
  const [active, setActive] = useState<LibraryModule | undefined>(undefined);
  const [activeStoryId, setActiveStoryId] = useState<string>('');
  const [pending, setPending] = useState<string[] | null>(initial.pending);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (activeLibraryId === START_ID) {
      setActive(undefined);
      setActiveStoryId('');
      return;
    }
    const lib = LIBRARIES.find((l) => l.id === activeLibraryId);
    if (lib === undefined) {
      setActiveLibraryId(START_ID);
      return;
    }
    let cancelled = false;
    void lib.load().then((mod) => {
      if (!cancelled) setActive(mod);
    });
    return (): void => {
      cancelled = true;
    };
  }, [activeLibraryId]);

  useEffect(() => {
    if (pending === null) return;
    if (activeLibraryId === START_ID) {
      setPending(null);
      return;
    }
    if (active === undefined || active.id !== activeLibraryId) return;
    setActiveStoryId(resolvePage(active, pending));
    setPending(null);
  }, [active, pending, activeLibraryId]);

  // While a URL-driven navigation is still resolving, a write here would
  // replace the address it came from.
  useEffect(() => {
    if (pending !== null) return;
    const path = buildPath(activeLibraryId, activeStoryId, active);
    if (!samePath(path, window.location.pathname)) {
      window.history.pushState(null, '', path);
    }
  }, [activeLibraryId, activeStoryId, active, pending]);

  useEffect(() => {
    const onPop = (): void => {
      const segments = routeSegments();
      setActiveLibraryId(segments[0] ?? START_ID);
      setPending(segments.slice(1));
    };
    window.addEventListener('popstate', onPop);
    return (): void => window.removeEventListener('popstate', onPop);
  }, []);

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

  const onStorySelect = useCallback((id: string): void => {
    setActiveStoryId(id);
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const onLibrarySelect = useCallback((id: string): void => {
    setActiveLibraryId(id);
    setPending([]);
  }, []);

  if (activeLibraryId === START_ID) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <LibrarySwitcher
          libraries={LIBRARY_TABS}
          activeId={activeLibraryId}
          onSelect={onLibrarySelect}
        />
        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', background: '#ffffff' }}>
          <MarkdownPane content={startContent} />
        </div>
      </div>
    );
  }

  if (active === undefined || pending !== null) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  const activeDocPage: DocPage | undefined = isDocSelection(activeStoryId)
    ? active.docs?.find((d) => d.id === stripDocPrefix(activeStoryId))
    : undefined;

  const activeStory: Story | undefined = activeDocPage === undefined
    ? active.stories.find((s) => s.id === activeStoryId)
    : undefined;

  const inspectorTabs: InspectorTabDef[] = activeStory === undefined || activeStory.doc === true
    ? []
    : [
        { id: 'source', label: 'Source', render: () => <SourceTab story={activeStory} /> },
        ...(active.buildInspectorTabs?.(activeStory) ?? []),
      ];

  const RuntimeProvider = active.RuntimeProvider ?? PassThroughProvider;
  const Demo = activeStory?.Demo;

  const showSidebar = !isMobile || sidebarOpen;
  const hasInspector = inspectorTabs.length > 0;
  const showInspector = hasInspector && (!isMobile || inspectorOpen);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <LibrarySwitcher
        libraries={LIBRARY_TABS}
        activeId={activeLibraryId}
        onSelect={onLibrarySelect}
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
