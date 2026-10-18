import { createPermissiveRegistry } from '../helpers';
import { describe, expect, it } from 'vitest';
import type { ActionDefinition } from '@action';
import { createLayoutStore } from '@layout';
import { createShell } from '@shell';
import type { Shell } from '@shell';
import { createDevtoolsFunctions, DEVTOOLS_CANVAS, type TimelineEntry } from '../../src/devtools';

const timelineOf = (fns: ReturnType<typeof createDevtoolsFunctions>) => {
  const found = fns.find((fn) => fn.id === 'devtools.timeline');
  if (found === undefined) throw new Error('no devtools.timeline');
  return found.execute;
};

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const signal = (): AbortSignal => new AbortController().signal;

const Probe: ActionDefinition = {
  id: 'Probe',
  data: { out: null },
  endpoints: { go: { fn: 'probe', target: 'out' } },
  lifecycle: { mount: [{ call: 'go' }] },
};

describe('devtools — endpoint timeline (fed by shell.onEndpoint telemetry)', () => {
  it('records non-devtools endpoint calls and excludes the dock’s own', async () => {
    let shell: Shell;
    const fns = createDevtoolsFunctions({ shell: () => shell });
    shell = createShell({
      canvases: [{ id: 'main' }, { id: DEVTOOLS_CANVAS }],
      registry: createPermissiveRegistry(),
      layoutStore: createLayoutStore(),
      actions: { Probe },
      functions: { ...Object.fromEntries(fns.map((fn) => [fn.id, fn.execute])), probe: async () => ({ ok: 1 }) },
    });
    await tick(); // let the tap's microtask subscribe

    shell.push('main', 'Probe');
    await tick();
    shell.push(DEVTOOLS_CANVAS, 'Probe');
    await tick();

    const result = (await timelineOf(fns)({}, signal())) as { rows: TimelineEntry[]; count: number };
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
      functions: { ...Object.fromEntries(fns.map((fn) => [fn.id, fn.execute])), probe: async () => ({ ok: 1 }) },
    });
    await tick();

    shell.push('main', 'Probe');
    shell.push('main', 'Probe');
    shell.push('main', 'Probe');
    await tick();

    const result = (await timelineOf(fns)({}, signal())) as { rows: TimelineEntry[]; count: number };
    expect(result.count).toBe(3);
    expect(result.rows[0]?.seq).toBeGreaterThan(result.rows[1]?.seq ?? Infinity);
  });
});
