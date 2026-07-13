import { describe, it, expect } from 'vitest';
import { createEventChannel } from '../src/events/channel';
import type { CortexEvent } from '../src/events/types';

describe('event channel', () => {
  it('stamps runId, agentPath, monotonic seq and ts', () => {
    const channel = createEventChannel('run_1', ['a']);
    const seen: CortexEvent[] = [];
    channel.onEvent((event) => seen.push(event));

    channel.emit({ type: 'step-start', step: 1 });
    channel.emit({ type: 'model-delta', text: 'x', channel: 'text' });

    expect(seen).toHaveLength(2);
    expect(seen[0]?.runId).toBe('run_1');
    expect(seen[0]?.agentPath).toEqual(['a']);
    expect(seen[1]?.seq).toBeGreaterThan(seen[0]?.seq ?? 0);
  });

  it('fans out to multiple listeners and swallows listener errors', () => {
    const channel = createEventChannel('run_1', ['a']);
    const seen: string[] = [];
    channel.onEvent(() => {
      throw new Error('bad observer');
    });
    channel.onEvent((event) => seen.push(event.type));

    channel.emit({ type: 'step-start', step: 1 });
    expect(seen).toEqual(['step-start']);
  });

  it('async iterator sees buffered AND live events, ends on close', async () => {
    const channel = createEventChannel('run_1', ['a']);
    channel.emit({ type: 'step-start', step: 1 }); // buffered before iteration

    const collected: string[] = [];
    const iteration = (async () => {
      for await (const event of channel.events) collected.push(event.type);
    })();

    channel.emit({ type: 'model-delta', text: 'x', channel: 'text' });
    channel.close();
    await iteration;

    expect(collected).toEqual(['step-start', 'model-delta']);
  });

  it('forward re-pushes child events verbatim', () => {
    const channel = createEventChannel('run_parent', ['parent']);
    const seen: CortexEvent[] = [];
    channel.onEvent((event) => seen.push(event));

    channel.forward({
      type: 'step-start',
      step: 1,
      runId: 'run_child',
      agentPath: ['parent', 'child'],
      seq: 7,
      ts: 123,
    });

    expect(seen[0]?.runId).toBe('run_child');
    expect(seen[0]?.agentPath).toEqual(['parent', 'child']);
    expect(seen[0]?.seq).toBe(7);
  });

  it('emit after close is a no-op', () => {
    const channel = createEventChannel('run_1', ['a']);
    const seen: CortexEvent[] = [];
    channel.onEvent((event) => seen.push(event));
    channel.close();
    channel.emit({ type: 'step-start', step: 1 });
    expect(seen).toHaveLength(0);
  });
});
