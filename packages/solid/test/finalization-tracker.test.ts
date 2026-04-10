import { describe, it, expect } from 'vitest';
import { createFinalizationTracker } from '../src/finalization-tracker';
import type { ParserEvent } from '../src/types';

describe('createFinalizationTracker', () => {
  it('starts with nothing final', () => {
    const tracker = createFinalizationTracker();
    expect(tracker.isFinal('widget')).toBe(false);
    expect(tracker.isRootFinal()).toBe(false);
  });

  it('finalizes previous sibling when new key enters', () => {
    const tracker = createFinalizationTracker();

    tracker.process([
      { type: 'enterObject', path: '' },
      { type: 'enterKey', path: '', key: 'widget' },
    ]);
    expect(tracker.isFinal('widget')).toBe(false);

    tracker.process([
      { type: 'enterKey', path: '', key: 'response' },
    ]);
    expect(tracker.isFinal('widget')).toBe(true);
    expect(tracker.isFinal('response')).toBe(false);
  });

  it('finalizes all children when container closes', () => {
    const tracker = createFinalizationTracker();

    tracker.process([
      { type: 'enterObject', path: '' },
      { type: 'enterKey', path: '', key: 'a' },
      { type: 'enterKey', path: '', key: 'b' },
      { type: 'leaveObject', path: '' },
    ]);

    expect(tracker.isFinal('a')).toBe(true);
    expect(tracker.isFinal('b')).toBe(true);
    expect(tracker.isRootFinal()).toBe(true);
  });

  it('finalizes nested paths when parent sibling enters', () => {
    const tracker = createFinalizationTracker();

    tracker.process([
      { type: 'enterObject', path: '' },
      { type: 'enterKey', path: '', key: 'widget' },
      { type: 'enterObject', path: 'widget' },
      { type: 'enterKey', path: 'widget', key: 'type' },
      { type: 'enterKey', path: 'widget', key: 'title' },
      { type: 'leaveObject', path: 'widget' },
      { type: 'enterKey', path: '', key: 'response' },
    ]);

    expect(tracker.isFinal('widget')).toBe(true);
    expect(tracker.isFinal('widget.type')).toBe(true);
    expect(tracker.isFinal('widget.title')).toBe(true);
    expect(tracker.isFinal('response')).toBe(false);
  });

  it('finalizes array elements when next index enters', () => {
    const tracker = createFinalizationTracker();

    tracker.process([
      { type: 'enterObject', path: '' },
      { type: 'enterKey', path: '', key: 'items' },
      { type: 'enterArray', path: 'items' },
      { type: 'enterIndex', path: 'items', index: 0 },
    ]);
    expect(tracker.isFinal('items.0')).toBe(false);

    tracker.process([
      { type: 'enterIndex', path: 'items', index: 1 },
    ]);
    expect(tracker.isFinal('items.0')).toBe(true);
    expect(tracker.isFinal('items.1')).toBe(false);
  });

  it('root final makes all paths final', () => {
    const tracker = createFinalizationTracker();

    tracker.process([
      { type: 'enterObject', path: '' },
      { type: 'enterKey', path: '', key: 'only' },
      { type: 'leaveObject', path: '' },
    ]);

    expect(tracker.isRootFinal()).toBe(true);
    // Any path is considered final when root is final
    expect(tracker.isFinal('anything')).toBe(true);
  });

  it('handles duplicate events idempotently', () => {
    const tracker = createFinalizationTracker();

    const events: ParserEvent[] = [
      { type: 'enterObject', path: '' },
      { type: 'enterKey', path: '', key: 'a' },
    ];

    tracker.process(events);
    tracker.process(events); // duplicate
    // Should not throw or double-finalize
    expect(tracker.isFinal('a')).toBe(false);
  });
});
