import type { Scope, ScopeChain } from './types';

export const createScopeChain = (data: Scope): ScopeChain => [data];

export const pushScope = (chain: ScopeChain, scope: Scope): ScopeChain => [scope, ...chain];
