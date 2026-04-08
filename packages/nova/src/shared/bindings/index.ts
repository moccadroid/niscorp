export { IfDirectiveSchema, ResolvableSchema } from './schemas';
export type { IfDirective } from './schemas';

export type { Scope, ScopeChain } from './types';

export { createScopeChain, pushScope } from './scope';

export { getPath, setPath, deletePath } from './paths';

export { resolve, resolvePath } from './resolve';
export type { ExtraScopes } from './resolve';
