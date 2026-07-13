import type { Rejection } from '../../types';
import { failedGeneration } from './failed-generation';
import { jsonlLines } from './jsonl-lines';

// ═══════════════════════════════════════════════════════════
// Wire strategies — provider pathologies, one FILE per pathology
// ═══════════════════════════════════════════════════════════
//
// The one strategy pattern in signal. Selection is registry DATA
// (ProviderEntry.wire lists ids); adding a provider quirk = one file
// here + one id on the provider entry + fixtures from the real
// error/response body. Nothing else changes. Two hooks:
//   'error'    — turn a provider ERROR into a Rejection.
//   'response' — contribute candidate TEXTS from response content.

export type ErrorWireStrategy = {
  id: string;
  hook: 'error';
  matches: (error: unknown) => boolean;
  recover: (error: unknown) => Rejection | undefined;
};

export type ResponseWireStrategy = {
  id: string;
  hook: 'response';
  candidates: (content: string) => string[];
};

export type WireStrategy = ErrorWireStrategy | ResponseWireStrategy;

const REGISTRY: Record<string, WireStrategy> = {
  [failedGeneration.id]: failedGeneration,
  [jsonlLines.id]: jsonlLines,
};

export const resolveWireStrategies = (ids: ReadonlyArray<string>): WireStrategy[] =>
  ids.map((id) => {
    const strategy = REGISTRY[id];
    if (!strategy) throw new Error(`Unknown wire strategy "${id}" — known: ${Object.keys(REGISTRY).join(', ')}`);
    return strategy;
  });

export const errorStrategies = (strategies: ReadonlyArray<WireStrategy>): ErrorWireStrategy[] =>
  strategies.filter((strategy): strategy is ErrorWireStrategy => strategy.hook === 'error');

export const responseStrategies = (strategies: ReadonlyArray<WireStrategy>): ResponseWireStrategy[] =>
  strategies.filter((strategy): strategy is ResponseWireStrategy => strategy.hook === 'response');

// Run the error-hook strategies; the first that claims the error wins.
export const recoverRejection = (
  strategies: ReadonlyArray<WireStrategy>,
  error: unknown,
): { strategy: string; rejection: Rejection } | undefined => {
  for (const strategy of errorStrategies(strategies)) {
    if (!strategy.matches(error)) continue;
    const rejection = strategy.recover(error);
    if (rejection) return { strategy: strategy.id, rejection };
  }
  return undefined;
};

export { failedGeneration, jsonlLines };
