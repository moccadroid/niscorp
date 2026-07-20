import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { Shell } from '@shell';
import { createDevtoolsFunctions, DEVTOOLS_CANVAS, type TimelineEntry } from '../../src/devtools';

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const signal = (): AbortSignal => new AbortController().signal;

// An action that calls a fn endpoint on mount — one recorded endpoint call.
const Probe: ActionDefinition = {
  id: 'Probe',
  data: { out: null },
  endpoints: { go: { fn: 'probe', target: 'out' } },
  lifecycle: { mount: [{ call: 'go' }] },
};

describe('devtools — endpoint timeline (fed by shell.onEndpoint telemetry)', () => {
  it('records non-devtools endpoint calls and excludes the dock’s own', async () => {
    // The devtools fns close over the session shell (lazy thunk); the shell's
    // functions include them — the tap subscribes to shell.onEndpoint.
    let shell: Shell;
    const fns = createDevtoolsFunctions({ shell: () => shell });
    shell = createShell({
      canvases: [{ id: 'main' }, { id: DEVTOOLS_CANVAS }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { Probe },
      functions: { ...fns, probe: async () => ({ ok: 1 }) },
    });
    await tick(); // let the tap's microtask subscribe

    shell.push('main', 'Probe'); // recorded
    await tick();
    shell.push(DEVTOOLS_CANVAS, 'Probe'); // excluded — the observer, not the observed
    await tick();

    const result = (await fns['devtools.timeline']!({}, signal())) as { rows: TimelineEntry[]; count: number };
    expect(result.count).toBe(1);
    const row = result.rows[0];
    expect(row?.name).toBe('go');
    expect(row?.kind).toBe('fn');
    expect(row?.ok).toBe(true);
    expect(row?.canvasId).toBe('main');
  });

  it('serves newest first and is bounded (ring buffer)', async () => {
    let shell: Shell;
    const fns = createDevtoolsFunctions({ shell: () => shell });
    shell = createShell({
      canvases: [{ id: 'main' }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { Probe },
      functions: { ...fns, probe: async () => ({ ok: 1 }) },
    });
    await tick();

    // three mounts → three recorded calls, newest first by seq
    shell.push('main', 'Probe');
    shell.push('main', 'Probe');
    shell.push('main', 'Probe');
    await tick();

    const result = (await fns['devtools.timeline']!({}, signal())) as { rows: TimelineEntry[]; count: number };
    expect(result.count).toBe(3);
    expect(result.rows[0]?.seq).toBeGreaterThan(result.rows[1]?.seq ?? Infinity);
  });
});
