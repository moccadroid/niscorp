import { useEffect, useMemo, useState, type FC } from 'react';
import { Sidebar as ChromeSidebar, type SidebarDoc } from './chrome/sidebar';
import { CanvasPane as ChromeCanvasPane } from './chrome/canvas-pane';
import { ChromeInspector, type InspectorTabDef } from './chrome/inspector';
import { LibrarySwitcher, type Library } from './chrome/library-switcher';
import { DocPane } from './chrome/doc-pane';
import type { DocPage, LibraryModule, SidebarStoryEntry, StatusMap } from './modules/types';

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

// A doc selection has its own id space; we prefix story-level routes with
// 'doc:' so the same activeStoryId state can hold either a story id or a
// doc id without collision.
const DOC_PREFIX = 'doc:';
const docId = (id: string): string => `${DOC_PREFIX}${id}`;
const isDocSelection = (id: string): boolean => id.startsWith(DOC_PREFIX);
const stripDocPrefix = (id: string): string => id.slice(DOC_PREFIX.length);

export const App: FC = () => {
  const [activeLibraryId, setActiveLibraryId] = useState<string>('nova');
  const [active, setActive] = useState<LibraryModule | undefined>(undefined);
  const [activeStoryId, setActiveStoryId] = useState<string>('');
  const [statusMap, setStatusMap] = useState<StatusMap>({});

  useEffect(() => {
    let cancelled = false;
    const lib = LIBRARIES.find((l) => l.id === activeLibraryId);
    if (lib === undefined) return;
    void lib.load().then((mod) => {
      if (cancelled) return;
      setActive(mod);
      setStatusMap({});
      // Default selection: first doc if any, else first story.
      const firstDoc = mod.docs?.[0];
      if (firstDoc !== undefined) {
        setActiveStoryId(docId(firstDoc.id));
        return;
      }
      const firstStory = mod.stories[0];
      if (firstStory !== undefined) {
        setActiveStoryId(mod.toSidebarEntry(firstStory).id);
      } else {
        setActiveStoryId('');
      }
    });
    return (): void => {
      cancelled = true;
    };
  }, [activeLibraryId]);

  useEffect(() => {
    if (active === undefined) return;
    let cancelled = false;
    const refresh = (): void => {
      void active.evaluateAll(active.stories).then((map) => {
        if (cancelled) return;
        setStatusMap(map);
      });
    };
    refresh();
    // If the library publishes a status-change subscription (e.g.
    // Cortex's localStorage-backed run history), wire it up so the
    // sidebar dots update without a manual refresh.
    const unsubscribe = active.subscribeStatusChange?.(refresh);
    return (): void => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [active]);

  const sidebarEntries = useMemo<SidebarStoryEntry[]>(() => {
    if (active === undefined) return [];
    return active.stories.map((s) => active.toSidebarEntry(s));
  }, [active]);

  const sidebarDocs = useMemo<SidebarDoc[]>(() => {
    if (active?.docs === undefined) return [];
    return active.docs.map((d) => ({ id: docId(d.id), title: d.title }));
  }, [active]);

  if (active === undefined) {
    return <div style={{ padding: 24 }}>Loading…</div>;
  }

  // Resolve the active selection: a doc page or a story.
  const activeDocPage: DocPage | undefined = isDocSelection(activeStoryId)
    ? active.docs?.find((d) => d.id === stripDocPrefix(activeStoryId))
    : undefined;

  const activeIndex = activeDocPage === undefined
    ? sidebarEntries.findIndex((e) => e.id === activeStoryId)
    : -1;
  const activeEntry = activeIndex >= 0 ? sidebarEntries[activeIndex] : undefined;
  const activeStory = activeIndex >= 0 ? active.stories[activeIndex] : undefined;

  const inspectorTabs: InspectorTabDef[] =
    activeStory === undefined ? [] : active.buildInspectorTabs(activeStory);

  const RuntimeProvider = active.RuntimeProvider;
  const Runner = active.Runner;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100vw' }}>
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
          statusMap={statusMap}
          kindOrder={[...active.kindOrder]}
          kindLabels={active.kindLabels}
          docs={sidebarDocs}
        />
        {activeDocPage !== undefined ? (
          // Doc mode: full-width canvas with rendered markdown OR an
          // interactive functional page (playground, settings, etc.).
          // No inspector either way.
          <DocPane page={activeDocPage} />
        ) : (
          <RuntimeProvider>
            <ChromeCanvasPane
              name={activeEntry?.name ?? ''}
              description={activeEntry?.description ?? ''}
            >
              {activeStory !== undefined && <Runner story={activeStory} />}
            </ChromeCanvasPane>
            <ChromeInspector tabs={inspectorTabs} />
          </RuntimeProvider>
        )}
      </div>
    </div>
  );
};
