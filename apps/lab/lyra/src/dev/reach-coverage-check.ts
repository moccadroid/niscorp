import { scopeBehaviors } from '@lyra/app/vex/behaviors';
import { ok, report } from './world';

const RULE_KEYS = ['read', 'write', 'insert', 'update', 'delete'];
const isRuleSet = (v: object): boolean => RULE_KEYS.some((k) => k in v);

// The machinery profiles (`identity`, `mailer`, `transport`, `scheduler`) are
// left out: each is granted only the tables its one surface reads.
const PERSON_REACHES = ['personal', 'household'] as const;

const named = Object.entries(scopeBehaviors).filter(([, entry]) => !isRuleSet(entry as object)) as [string, Record<string, unknown>][];

const narrowing = named.filter(([, variants]) => PERSON_REACHES.some((r) => r in variants));

ok(
  'some tables narrow the reach for a person, or this check is measuring nothing',
  narrowing.length > 0,
  `${narrowing.length} table(s) declare a person-facing profile`,
);

const gaps: string[] = [];
for (const [table, variants] of narrowing) {
  for (const reach of PERSON_REACHES) {
    if (!(reach in variants)) gaps.push(`${table} declares ${PERSON_REACHES.filter((r) => r in variants).join('/')} but not ${reach}`);
  }
}

ok(
  'every table that narrows for one person-reach narrows for all of them',
  gaps.length === 0,
  gaps.length === 0
    ? `${narrowing.length} tables × ${PERSON_REACHES.length} reaches, no fall-through to the studio`
    : gaps.join('; '),
);

const withDefault = narrowing.filter(([, v]) => 'default' in v);
const ruleless = withDefault.filter(([, v]) => Object.keys((v['default'] ?? {}) as object).length === 0).map(([t]) => t);
ok(
  '...and the thing it prevents is real: every one of them has a default to fall through TO',
  withDefault.length === narrowing.length,
  ruleless.length === 0
    ? 'each resolves to `default` — studio-wide, to a member'
    : `each resolves to \`default\` — studio-wide for most, and RULE-FREE (every tenant) for: ${ruleless.join(', ')}`,
);

const householdPersonRules: string[] = [];
for (const [table, variants] of narrowing) {
  const household = variants['household'] as { write?: { set?: string; match?: string }[] } | undefined;
  for (const rule of household?.write ?? []) {
    if (rule.set === 'person_id' || rule.match === 'person_id') householdPersonRules.push(table);
  }
}

ok(
  'the household reach stamps no person on a write — the subject comes from guardianships',
  householdPersonRules.length === 0,
  householdPersonRules.length === 0
    ? 'no person rule on any household write; the $lookup is the only pin'
    : `${householdPersonRules.join(', ')} — a person rule here re-pins the write to the caller`,
);

report('a reach is only safe once every table declares it: a missing profile falls through to the studio, silently');
