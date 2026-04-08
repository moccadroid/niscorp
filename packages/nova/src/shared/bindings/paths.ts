import { isArray, isObject } from '../common';

// ═══════════════════════════════════════════════════════════
// Path helpers — get/set/delete on nested data structures.
// Dot paths: "a.b.0.c". Numeric segments are array indices
// when the parent is an array.
// ═══════════════════════════════════════════════════════════

const splitPath = (path: string): string[] => {
  if (path.length === 0) return [];
  return path.split('.');
};

const isIndex = (segment: string): boolean => /^\d+$/.test(segment);

type Container = Record<string, unknown> | unknown[];

const cloneContainer = (value: unknown, nextSegment: string | undefined): Container => {
  if (isArray(value)) return value.slice();
  if (isObject(value)) return { ...value };
  if (nextSegment !== undefined && isIndex(nextSegment)) return [];
  return {};
};

const writeSegment = (container: Container, segment: string, value: unknown): void => {
  if (isArray(container)) {
    if (isIndex(segment)) {
      const index = Number.parseInt(segment, 10);
      container[index] = value;
    }
    return;
  }
  container[segment] = value;
};

const readSegment = (container: Container, segment: string): unknown => {
  if (isArray(container)) {
    if (!isIndex(segment)) return undefined;
    const index = Number.parseInt(segment, 10);
    return container[index];
  }
  return container[segment];
};

export const getPath = (data: unknown, path: string): unknown => {
  const segments = splitPath(path);
  let current: unknown = data;
  for (const segment of segments) {
    if (current === undefined || current === null) return undefined;
    if (isArray(current)) {
      if (isIndex(segment)) {
        const index = Number.parseInt(segment, 10);
        current = current[index];
        continue;
      }
      if (segment === 'length') {
        current = current.length;
        continue;
      }
      return undefined;
    }
    if (isObject(current)) {
      if (segment in current) {
        current = current[segment];
        continue;
      }
      return undefined;
    }
    return undefined;
  }
  return current;
};

export const setPath = (data: unknown, path: string, value: unknown): unknown => {
  const segments = splitPath(path);
  if (segments.length === 0) return value;

  const root = cloneContainer(data, segments[0]);
  let parent: Container = root;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    if (segment === undefined) continue;
    const existing = readSegment(parent, segment);
    const cloned = cloneContainer(existing, nextSegment);
    writeSegment(parent, segment, cloned);
    parent = cloned;
  }

  const last = segments[segments.length - 1];
  if (last !== undefined) writeSegment(parent, last, value);
  return root;
};

export const deletePath = (data: unknown, path: string): unknown => {
  const segments = splitPath(path);
  if (segments.length === 0) return undefined;

  const root = cloneContainer(data, segments[0]);
  let parent: Container = root;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];
    if (segment === undefined) continue;
    const existing = readSegment(parent, segment);
    if (existing === undefined || existing === null) return root;
    const cloned = cloneContainer(existing, nextSegment);
    writeSegment(parent, segment, cloned);
    parent = cloned;
  }

  const last = segments[segments.length - 1];
  if (last === undefined) return root;
  if (isArray(parent)) {
    if (isIndex(last)) {
      const index = Number.parseInt(last, 10);
      parent.splice(index, 1);
    }
  } else {
    delete parent[last];
  }
  return root;
};
