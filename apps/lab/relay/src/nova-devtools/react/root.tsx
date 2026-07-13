import { useEffect, useMemo } from 'react';
import { z } from 'zod';
import type { Shell } from '@niscorp/nova';
import { NovaCanvas } from '@niscorp/nova/react';
import type { NovaComponent } from '@niscorp/nova/react';
import type { ReactNode } from 'react';
import { installDevtoolsHotkey, useDevtoolsEnabled } from '../core/flag';
import { JsonTree } from './json-tree';

// The React adapter for nova-devtools — the whole framework-specific surface
// is: register two primitives, install the hotkey, and render the `devtools`
// canvas in a fixed overlay. A Svelte/Vue port reimplements exactly this file
// (plus the slot-wrapper chip anchor); the actions/layouts/fns ship unchanged.

const DevtoolsPanelProps = z.object({}).strict();
const DevtoolsPanel: NovaComponent<z.infer<typeof DevtoolsPanelProps>> = ({ children }: { children?: ReactNode }) => (
  <div className="nd-panel">{children}</div>
);
DevtoolsPanel.meta = {
  description: 'Dark tooling panel chrome (devtools primitive).',
  propsSchema: DevtoolsPanelProps,
};

export const NovaDevtoolsRoot = ({ shell }: { shell: Shell }) => {
  const enabled = useDevtoolsEnabled();

  // Primitives must exist before the canvas first renders — register during
  // render, idempotently, on the shell's own registry.
  useMemo(() => {
    if (!shell.registry.has('JsonTree')) shell.registry.registerAll({ JsonTree, DevtoolsPanel });
  }, [shell]);

  useEffect(() => installDevtoolsHotkey(), []);

  if (!enabled) return null;
  return (
    <div className="nd-dock">
      <NovaCanvas id="devtools" shell={shell} />
    </div>
  );
};
