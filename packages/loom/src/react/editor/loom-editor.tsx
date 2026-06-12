import { useEffect, useState, type FC } from 'react';
import type { ZodType } from 'zod';
import type { ComponentRegistry, LayoutNode } from '@niscorp/nova';
import { NovaShell, type NovaComponent } from '@niscorp/nova/react';
import { createLoomEditor, type LoomArtifact, type LoomEditor as LoomEditorApi } from '@editor/editor';
import type { FieldContext } from '@compile/types';
import { createLoomRegistry } from '../kit/index.js';
import { LoomDocumentContext } from '../hooks/document.js';

// <LoomEditor> — the integrated editing surface and the package's main export.
// It builds the editor controller (an empty Nova shell + a plugin loader) and
// renders it. Everything visible is plugin-contributed; the component is agnostic
// about which plugins those are — it loads exactly `plugins`, in order, so a later
// one can override or remove an earlier one. (Apps that want the JSON / validation
// views spread `defaultPlugins()` at the front.) The controller is framework-free;
// this component supplies the kit and renders the shell. Give the element a new
// `key` to open a different artifact.

// A renderer plugin: the core descriptor plus the components it registers.
// `mount` and `documents` drive the controller; `widgets` are the compiler
// matchers (role + match) that upgrade form fields. `components` (keyed by role)
// supply every render — the views a mount references AND the widget renders. A
// role names a component; `components` provides it.
export type LoomEditorPlugin = {
  name: string;
  documents: Record<string, ZodType | ((value: unknown) => LayoutNode)>;
  components?: Record<string, NovaComponent>;
  widgets?: { role: string; match: (field: FieldContext) => boolean }[];
  mount?: (editor: LoomEditorApi) => void;
};

export type LoomEditorProps = {
  /** The loaded plugins (capabilities). Read once on mount. */
  plugins: LoomEditorPlugin[];
  /** The artifact to open. Read once on mount; give a new `key` to switch. */
  artifact: LoomArtifact;
  /** Called with the live documents whenever they change. */
  onChange?: (documents: Record<string, unknown>) => void;
};

export const LoomEditor: FC<LoomEditorProps> = ({ plugins, artifact, onChange }) => {
  const [api, setApi] = useState<LoomEditorApi | null>(null);
  const [documents, setDocuments] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const registry = createLoomRegistry();
    for (const plugin of plugins) {
      for (const [role, component] of Object.entries(plugin.components ?? {})) registry.register(role, component);
    }

    const editor = createLoomEditor({ registry: registry as ComponentRegistry });
    for (const plugin of plugins) {
      editor.loadPlugin({
        name: plugin.name,
        documents: plugin.documents,
        ...(plugin.widgets ? { widgets: plugin.widgets.map((w) => ({ role: w.role, match: w.match })) } : {}),
        ...(plugin.mount ? { mount: plugin.mount } : {}),
      });
    }
    editor.open(artifact);
    setApi(editor);
    setDocuments(editor.documents);
    onChange?.(editor.documents);
    const off = editor.on('change', () => {
      setDocuments(editor.documents);
      onChange?.(editor.documents);
    });
    return () => {
      off();
      editor.dispose();
      setApi(null);
    };
    // Mount-only; a new `key` re-opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shell = api?.shell;
  return shell === undefined || shell === null ? null : (
    <LoomDocumentContext.Provider value={documents}>
      <NovaShell shell={shell} />
    </LoomDocumentContext.Provider>
  );
};
