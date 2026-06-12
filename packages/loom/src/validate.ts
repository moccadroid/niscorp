import type { Shell } from '@niscorp/nova';
import type { ZodType } from 'zod';
import { ERROR_NAMESPACE } from './compile/to-nova.js';

// Validate-on-edit. The Zod schema is the truth: on each change, the working
// document (everything except the reserved error channel) is parsed, and a
// nested error tree — mirroring the document, keyed by Zod's issue paths —
// is written back under that channel for the fields to bind to. The document
// itself stays clean; `onDocument` reports it without the error channel.

type Doc = Record<string, unknown>;

type Issue = { readonly path: ReadonlyArray<PropertyKey>; readonly message: string };

// Place a message at a nested path, mirroring the document shape. First issue
// per path wins (the most specific message Zod emits first).
const setPath = (root: Doc, path: ReadonlyArray<PropertyKey>, message: string): void => {
  let node = root;
  for (let i = 0; i < path.length - 1; i += 1) {
    const key = String(path[i]);
    const next = node[key];
    node = typeof next === 'object' && next !== null ? (next as Doc) : (node[key] = {});
  }
  const leaf = String(path[path.length - 1]);
  if (!(leaf in node)) node[leaf] = message;
};

const errorTree = (issues: ReadonlyArray<Issue>): Doc => {
  const tree: Doc = {};
  for (const issue of issues) {
    if (issue.path.length > 0) setPath(tree, issue.path, issue.message);
  }
  return tree;
};

const stripErrors = (data: Doc): Doc => {
  const { [ERROR_NAMESPACE]: _omit, ...document } = data;
  return document;
};

export const attachValidation = (
  shell: Shell,
  instanceId: string,
  schema: ZodType,
  onDocument?: (document: Doc) => void,
): (() => void) => {
  const runtime = shell.getRuntime(instanceId);
  if (runtime === undefined) return () => {};

  let lastDocument = '';
  const handle = (data: Doc): void => {
    const document = stripErrors(data);
    const fingerprint = JSON.stringify(document);
    if (fingerprint === lastDocument) return; // our own error write — not a real edit
    lastDocument = fingerprint;

    const result = schema.safeParse(document);
    const errors = result.success ? {} : errorTree(result.error.issues);
    runtime.setData({ ...document, [ERROR_NAMESPACE]: errors });
    onDocument?.(document);
  };

  return shell.onDataChange((change) => {
    if (change.instanceId === instanceId) handle(change.data);
  });
};
