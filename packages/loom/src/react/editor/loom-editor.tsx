import { useEffect, useState, type FC } from 'react';
import type { ZodType } from 'zod';
import type { ComponentRegistry, LayoutNode } from '@niscorp/nova';
import { NovaShell, type NovaComponent } from '@niscorp/nova/adapters/react';
import { createLoomEditor, type LoomArtifact, type LoomEditor as LoomEditorApi } from '@editor/editor';
import type { FieldContext } from '@compile/types';
import { createLoomRegistry } from '../kit/index.js';
import { LoomDocumentContext } from '../hooks/document.js';

export type LoomEditorPlugin = {
  name: string;
  documents: Record<string, ZodType | ((value: unknown) => LayoutNode)>;
  components?: Record<string, NovaComponent>;
  widgets?: { role: string; match: (field: FieldContext) => boolean }[];
  mount?: (editor: LoomEditorApi) => void;
};

export type LoomEditorProps = {
  plugins: LoomEditorPlugin[];
  artifact: LoomArtifact;
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
    // Mount-only: `plugins` and `artifact` are read once; a new `key` re-opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shell = api?.shell;
  return shell === undefined || shell === null ? null : (
    <LoomDocumentContext.Provider value={documents}>
      <NovaShell shell={shell} />
    </LoomDocumentContext.Provider>
  );
};
