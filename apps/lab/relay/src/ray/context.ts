import type { Shell } from '@niscorp/nova';
import { CATALOG } from './catalog';

// The per-turn context: what's on each canvas right now (SCREEN) + what Ray can
// open (ACTIONS, with serialized input schemas). SCREEN is the REAL data — for
// each canvas, its stack trail (so Ray can navigate it) followed by the active
// instance's live data, serialized as-is (minified JSON). Nothing is summarized,
// truncated, or dropped: the model decides what matters, the same way the user
// reads the screen. Built fresh each turn from the actual shell state.
export const buildContext = (shell: Shell): string => {
  const state = shell.getState();
  const screen: string[] = [];
  for (const [canvasId, cs] of Object.entries(state.canvases)) {
    if (cs.active === undefined) {
      screen.push(`  ${canvasId}: (empty)`);
      continue;
    }
    // The stack trail — every instance on this canvas as definitionId(instanceId),
    // newest last; `*` marks the active (visible, top) one. The ids are what the
    // `navigate` tool targets (back / jump to an instance / root).
    const trail = cs.stack
      .map((i, idx) => `${i.definitionId}(${i.id})${idx === cs.stack.length - 1 ? '*' : ''}`)
      .join(' › ');
    const rt = shell.getRuntime(cs.active.id);
    const data = rt === undefined ? '{}' : JSON.stringify(rt.getData());
    screen.push(`  ${canvasId}: ${trail}`);
    screen.push(`    data: ${data}`);
  }

  const actions = CATALOG.map(
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
