// Mutations — the write pipeline. Grammar (schema.ts), derived contracts
// (signature.ts), and the validate→scope→compile→execute engine (engine.ts).
// Writes are replay-only artifacts: a mutation lives in the cache as a
// `kind: 'mutation'` entry and is invoked by fingerprint; there is no
// generation path (dev-authored seeds only).
export { MutationSchema, MutationDefinitionSchema } from './schema.js';
export type { Mutation, MutationDefinition, CoreMutation, ResolvedMutation } from './schema.js';
export { executeMutation } from './engine.js';
export type { MutationClient, MutationTx, MutationContext } from './engine.js';
export { collectMutationContext, collectQueryContext, mutationEffect, requiredContextKeys, lintMutation } from './signature.js';
export type { ContextField, ContextSignature, MutationEffect } from './signature.js';
