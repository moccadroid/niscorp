import { describe, it, expect } from 'vitest';
import { createProducerState } from '../../src/context/producer-state';

describe('createProducerState', () => {
  it('get/set round-trips a value', () => {
    const state = createProducerState();
    state.set('key', 42);
    expect(state.get('key')).toBe(42);
  });

  it('has returns false for missing keys', () => {
    const state = createProducerState();
    expect(state.has('nope')).toBe(false);
  });

  it('has returns true for set keys', () => {
    const state = createProducerState();
    state.set('x', 'y');
    expect(state.has('x')).toBe(true);
  });

  it('flag sets a flagged value', () => {
    const state = createProducerState();
    state.flag('alert');
    expect(state.has('alert')).toBe(true);
  });

  it('delete removes a key', () => {
    const state = createProducerState();
    state.set('key', 'value');
    state.delete('key');
    expect(state.has('key')).toBe(false);
    expect(state.get('key')).toBeUndefined();
  });

  it('toObject returns a snapshot', () => {
    const state = createProducerState();
    state.set('a', 1);
    state.set('b', 'two');
    const obj = state.toObject();
    expect(obj.a).toBe(1);
    expect(obj.b).toBe('two');
  });
});
