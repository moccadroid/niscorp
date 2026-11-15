import { useEffect, useRef, useState, type FC } from 'react';
import type { ComponentRegistry } from '@niscorp/nova';
import { NovaShell, type NovaComponent } from '@niscorp/nova/adapters/react';
import { createLoomEditor, type LoomArtifact, type LoomEditor as LoomEditorApi, type LoomPlugin } from '@editor';
import { createLoomRegistry } from '../kit/index.js';
import { LoomDocumentContext } from '../hooks/document.js';

export type LoomEditorPlugin = LoomPlugin & { components?: Record<string, NovaComponent> };

export type LoomEditorProps = {
  plugins: LoomEditorPlugin[];
  artifact: LoomArtifact;
  onChange?: (documents: Record<string, unknown>) => void;
};

export const LoomEditor: FC<LoomEditorProps> = ({ plugins, artifact, onChange }) => {
  const [api, setApi] = useState<LoomEditorApi | null>(null);
  const [documents, setDocuments] = useState<Record<string, unknown>>({});
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    const registry = createLoomRegistry();
    for (const plugin of plugins) {
      for (const [role, component] of Object.entries(plugin.components ?? {})) registry.register(role, component);
    }

    const editor = createLoomEditor({ registry: registry as ComponentRegistry });
    for (const plugin of plugins) editor.loadPlugin(plugin);
    editor.open(artifact);
    setApi(editor);
    setDocuments(editor.documents);
    onChangeRef.current?.(editor.documents);
    const off = editor.on('change', () => {
      setDocuments(editor.documents);
      onChangeRef.current?.(editor.documents);
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
