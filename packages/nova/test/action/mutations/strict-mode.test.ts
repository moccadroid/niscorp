import { describe, expect, it } from 'vitest';
import { applyMutation, applyMutations } from '@action/mutations';
import { MutationError } from '@shared/errors';

describe('mutation ops — strict mode', () => {
  describe('pop', () => {
    it('silently returns data when path is missing (lax)', () => {
      expect(applyMutation({}, { pop: 'items' })).toEqual({});
    });
    it('throws MutationError when path is missing (strict)', () => {
      expect(() => applyMutation({}, { pop: 'items' }, { strict: true })).toThrow(MutationError);
    });
    it('throws MutationError when path is not an array (strict)', () => {
      expect(() =>
        applyMutation({ items: 'nope' }, { pop: 'items' }, { strict: true }),
      ).toThrow(MutationError);
    });
  });

  describe('push', () => {
    it('creates a new array when path is missing (lax)', () => {
      expect(applyMutation({}, { push: 'items', value: 1 })).toEqual({ items: [1] });
    });
    it('throws MutationError when path is missing (strict)', () => {
      expect(() =>
        applyMutation({}, { push: 'items', value: 1 }, { strict: true }),
      ).toThrow(MutationError);
    });
    it('throws MutationError when path is not an array (strict)', () => {
      expect(() =>
        applyMutation({ items: 5 }, { push: 'items', value: 1 }, { strict: true }),
      ).toThrow(MutationError);
    });
  });

  describe('removeAt', () => {
    it('silently returns data when path is not an array (lax)', () => {
      expect(applyMutation({ items: 1 }, { removeAt: 'items', index: 0 })).toEqual({ items: 1 });
    });
    it('throws MutationError in strict mode', () => {
      expect(() =>
        applyMutation({}, { removeAt: 'items', index: 0 }, { strict: true }),
      ).toThrow(MutationError);
    });
  });

  describe('clear', () => {
    it('deletes a scalar in lax mode', () => {
      expect(applyMutation({ a: 1, b: 2 }, { clear: 'a' })).toEqual({ b: 2 });
    });
    it('throws MutationError for scalars in strict mode', () => {
      expect(() =>
        applyMutation({ a: 1 }, { clear: 'a' }, { strict: true }),
      ).toThrow(MutationError);
    });
    it('throws MutationError for missing paths in strict mode', () => {
      expect(() => applyMutation({}, { clear: 'missing' }, { strict: true })).toThrow(
        MutationError,
      );
    });
    it('still clears arrays and objects in strict mode', () => {
      expect(
        applyMutations(
          { arr: [1, 2], obj: { a: 1 } },
          [{ clear: 'arr' }, { clear: 'obj' }],
          { strict: true },
        ),
      ).toEqual({ arr: [], obj: {} });
    });
  });

  it('error includes op, path, and reason context', () => {
    try {
      applyMutation({}, { pop: 'items' }, { strict: true });
    } catch (err) {
      expect(err).toBeInstanceOf(MutationError);
      const me = err as MutationError;
      expect(me.context).toMatchObject({ op: 'pop', path: 'items', reason: 'missing' });
      return;
    }
    throw new Error('expected MutationError');
  });
});
