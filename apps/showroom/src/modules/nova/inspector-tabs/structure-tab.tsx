import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type FC } from 'react';
import type { CanvasState, Shell } from '@niscorp/nova';
import type { NovaStory } from '@showroom/modules/nova/story-types';
import { JsonViewer } from '@showroom/chrome/json-viewer';

// ═══════════════════════════════════════════════════════════
// Structure tab — shows the authored definitions behind the
// story as pretty JSON, scoped by a selector at the top.
//
//   Shell      → shell state overview (canvases, their active
//                action definitionIds — not the internal UUIDs).
//   Canvas: X  → that canvas's live state + the active
//                ActionDefinition (authored) as JSON.
//   Action: Y  → the full ActionDefinition: id, data, triggers,
//                layout. This is the useful view.
//   Layout     → story.layout (LayoutNode) as JSON.
//
// All data comes from the public Shell API: getState() for
// canvas snapshots, getRuntime(id).definition for authored
// ActionDefinitions. No internal poking.
// ═══════════════════════════════════════════════════════════

type Scope =
  | { kind: 'layout' }
  | { kind: 'shell' }
  | { kind: 'canvas'; canvasId: string }
  | { kind: 'action'; instanceId: string; definitionId: string; canvasId: string };

type ScopeEntry = { id: string; label: string; scope: Scope };

// ─── Live canvas state (cached snapshot to avoid infinite loops) ──────────────

type Cache = {
  shell: Shell;
  canvases: Record<string, CanvasState>;
};

const useCanvases = (shell: Shell): Record<string, CanvasState> => {
  const cacheRef = useRef<Cache | undefined>(undefined);

  const subscribe = useCallback(
    (cb: () => void) =>
      shell.onStateChange(() => {
        cacheRef.current = { shell, canvases: shell.getState().canvases };
        cb();
      }),
    [shell],
  );

  const getSnapshot = useCallback((): Record<string, CanvasState> => {
    const cached = cacheRef.current;
    if (cached === undefined || cached.shell !== shell) {
      const canvases = shell.getState().canvases;
      cacheRef.current = { shell, canvases };
      return canvases;
    }
    return cached.canvases;
  }, [shell]);

  return useSyncExternalStore(subscribe, getSnapshot);
};

// ─── Build scope list from current shell state ────────────────────────────────

const buildScopes = (
  story: NovaStory,
  canvases: Record<string, CanvasState> | undefined,
): ScopeEntry[] => {
  if (story.shell === undefined) {
    return [{ id: 'layout', label: 'Layout', scope: { kind: 'layout' } }];
  }
  const out: ScopeEntry[] = [{ id: 'shell', label: 'Shell', scope: { kind: 'shell' } }];
  const map = canvases ?? {};
  for (const canvasId of Object.keys(map)) {
    out.push({
      id: `canvas:${canvasId}`,
      label: `Canvas: ${canvasId}`,
      scope: { kind: 'canvas', canvasId },
    });
  }
  for (const [canvasId, canvas] of Object.entries(map)) {
    const active = canvas.active;
    if (active === undefined) continue;
    out.push({
      id: `action:${active.id}`,
      label: `Action: ${active.definitionId}`,
      scope: {
        kind: 'action',
        instanceId: active.id,
        definitionId: active.definitionId,
        canvasId,
      },
    });
  }
  return out;
};

const defaultScopeId = (story: NovaStory, scopes: ScopeEntry[]): string => {
  if (story.shell === undefined) return scopes[0]?.id ?? '';
  if (story.kind === 'action') {
    const firstAction = scopes.find((s) => s.scope.kind === 'action');
    if (firstAction !== undefined) return firstAction.id;
  }
  return scopes[0]?.id ?? '';
};

// ─── Scope → value to display ─────────────────────────────────────────────────

const buildShellOverview = (canvases: Record<string, CanvasState>): unknown => {
  const out: Record<string, unknown> = {};
  for (const [id, c] of Object.entries(canvases)) {
    out[id] = {
      stack: c.stack.map((i) => i.definitionId),
      active: c.active === undefined ? null : c.active.definitionId,
      stackDepth: c.stack.length,
    };
  }
  return { canvases: out };
};

const buildCanvasView = (shell: Shell, canvas: CanvasState): unknown => {
  const activeDef = canvas.active === undefined
    ? null
    : shell.getRuntime(canvas.active.id)?.definition ?? null;
  return {
    id: canvas.id,
    stack: canvas.stack.map((i) => ({
      instanceId: i.id,
      definitionId: i.definitionId,
      status: i.status,
    })),
    active: canvas.active === undefined
      ? null
      : {
          instanceId: canvas.active.id,
          definitionId: canvas.active.definitionId,
          status: canvas.active.status,
        },
    activeDefinition: activeDef,
  };
};

const buildActionView = (shell: Shell, instanceId: string): unknown => {
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) return { error: 'Instance no longer exists.' };
  return runtime.definition;
};

// ─── Selector ─────────────────────────────────────────────────────────────────

const ScopeSelector: FC<{
  scopes: ScopeEntry[];
  activeId: string;
  onSelect: (id: string) => void;
}> = ({ scopes, activeId, onSelect }) => (
  <div
    style={{
      display: 'flex',
      gap: 4,
      flexWrap: 'wrap',
      padding: '8px 12px',
      borderBottom: '1px solid #e5e7eb',
      background: '#fafafa',
    }}
  >
    {scopes.map((s) => {
      const active = s.id === activeId;
      return (
        <button
          key={s.id}
          type="button"
          onClick={() => onSelect(s.id)}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            border: '1px solid #d1d5db',
            borderRadius: 4,
            background: active ? '#2563eb' : '#ffffff',
            color: active ? '#ffffff' : '#1f2937',
            fontFamily: 'ui-monospace, Menlo, monospace',
            cursor: 'pointer',
          }}
        >
          {s.label}
        </button>
      );
    })}
  </div>
);

// ─── Panels ───────────────────────────────────────────────────────────────────

const ShellStructure: FC<{ story: NovaStory; shell: Shell }> = ({ story, shell }) => {
  const canvases = useCanvases(shell);
  const scopes = useMemo(() => buildScopes(story, canvases), [story, canvases]);
  const [activeId, setActiveId] = useState<string>(() => defaultScopeId(story, scopes));

  useEffect(() => {
    if (!scopes.some((s) => s.id === activeId)) {
      setActiveId(scopes[0]?.id ?? '');
    }
  }, [scopes, activeId]);

  const active = scopes.find((s) => s.id === activeId);
  const value = useMemo((): unknown => {
    if (active === undefined) return null;
    const scope = active.scope;
    if (scope.kind === 'shell') return buildShellOverview(canvases);
    if (scope.kind === 'canvas') {
      const canvas = canvases[scope.canvasId];
      return canvas === undefined ? { error: `Canvas ${scope.canvasId} not found.` } : buildCanvasView(shell, canvas);
    }
    if (scope.kind === 'action') return buildActionView(shell, scope.instanceId);
    return null;
  }, [active, canvases, shell]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScopeSelector scopes={scopes} activeId={activeId} onSelect={setActiveId} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <JsonViewer value={value} />
      </div>
    </div>
  );
};

const StaticStructure: FC<{ story: NovaStory }> = ({ story }) => {
  const scopes: ScopeEntry[] = [{ id: 'layout', label: 'Layout', scope: { kind: 'layout' } }];
  const value: unknown = story.layout ?? { error: 'No layout on this story.' };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScopeSelector scopes={scopes} activeId="layout" onSelect={() => {}} />
      <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
        <JsonViewer value={value} />
      </div>
    </div>
  );
};

export const StructureTab: FC<{ story: NovaStory }> = ({ story }) => {
  if (story.shell !== undefined) {
    return <ShellStructure story={story} shell={story.shell} />;
  }
  if (story.layout !== undefined) {
    return <StaticStructure story={story} />;
  }
  return (
    <div style={{ padding: 16, color: '#9ca3af', fontSize: 12 }}>
      This story has no shell and no layout — nothing to show.
    </div>
  );
};
