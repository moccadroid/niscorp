export type ScopePolicy = {
  default: 'allow' | 'deny';
  entities: Record<string, ScopeEntityRule>;
};

export type ScopeEntityRule =
  | { public: true }
  | { deny: true }
  | ScopeFilterRule
  | ScopeFilterRule[];

export type ScopeFilterRule = {
  field: string;
  source: string;
  op?: 'eq' | 'in' | 'neq';
};

export type ScopeValues = Record<string, unknown>;
