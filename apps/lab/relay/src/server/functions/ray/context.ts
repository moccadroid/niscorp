import type { Shell } from '@niscorp/nova';
import { catalogEntries, type CatalogEntry } from './catalog';

// `screens`: the screens this session built or kept, beside the catalog the app ships.
export const buildContext = (shell: Shell, screens: readonly CatalogEntry[] = []): string => {
  const state = shell.getState();
  const screen: string[] = [];
  for (const [canvasId, cs] of Object.entries(state.canvases)) {
    if (cs.active === undefined) {
      screen.push(`  ${canvasId}: (empty)`);
      continue;
    }
    const trail = cs.stack
      .map((i, idx) => `${i.definitionId}(${i.id})${idx === cs.stack.length - 1 ? '*' : ''}`)
      .join(' › ');
    const rt = shell.getRuntime(cs.active.id);
    const data = rt === undefined ? '{}' : JSON.stringify(rt.getData());
    screen.push(`  ${canvasId}: ${trail}`);
    screen.push(`    data: ${data}`);
  }

  const actions = [...catalogEntries(), ...screens].map(
    (c) => `  ${c.id} — ${c.description}\n    input: ${JSON.stringify(c.input)}`,
  ).join('\n');

  return [
    "SCREEN — each canvas: its stack trail as definitionId(instanceId) with * = the active/visible top, then that instance's live data:",
    screen.join('\n'),
    '',
    'ACTIONS (place on a canvas with `stack` push/replace):',
    actions,
  ].join('\n');
};
