// Run: pnpm --filter lyra exec tsx src/dev/reach-coverage-check.ts
import { scopeBehaviors } from '@lyra/app/vex/behaviors';
import { ok, report } from './world';

// ═══════════════════════════════════════════════════════════════
// A NEW REACH IS FAIL-OPEN UNTIL EVERY TABLE DECLARES IT.
//
// This check exists because of one line in vex:
//
//   return (profile === undefined ? undefined : entry[profile]) ?? entry['default'];
//     — packages/vex/src/scope/grants.ts, behaviorFor
//
// A table declaring named variants and NO default refuses an unprofiled
// principal, which is the fail-closed half that file describes. But every
// member-facing table here declares `default: tenantWrite` — the desk's reach,
// studio-wide — so a profile the table does NOT declare falls through to the
// STUDIO, not to nothing.
//
// Concretely: `passes` declares `personal` and `household`. Delete the
// `household` line and a household-reached read of passes returns every pass
// at the studio, to a member, with no error anywhere. The read still runs. The
// screen still renders. It is simply somebody else's data.
//
// That failure has no natural home — it is not in an entry, not in a screen,
// and not in a grant — so it gets a check of its own. THE RULE: any table that
// bothers to narrow a reach for one profile must narrow it for all of them.
// Adding a third profile later makes this fail loudly on day one rather than
// leaking quietly on day two.
// ═══════════════════════════════════════════════════════════════

const RULE_KEYS = ['read', 'write', 'insert', 'update', 'delete'];
const isRuleSet = (v: object): boolean => RULE_KEYS.some((k) => k in v);

// The reaches a PERSON is served at. Machinery profiles are deliberately
// excluded: `identity`, `mailer`, `transport` and `scheduler` are held by roles
// nobody wears, each granted exactly the tables its one surface reads, and
// requiring them everywhere would mean declaring a rule for tables those roles
// can never touch. This check is about the reaches a member's own session can
// be compiled at, where a missing variant is a silent widening.
const PERSON_REACHES = ['personal', 'household'] as const;

const named = Object.entries(scopeBehaviors).filter(([, entry]) => !isRuleSet(entry as object)) as [string, Record<string, unknown>][];

// Tables that narrow for at least one person-reach — the ones this rule binds.
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

// The rule above is only worth anything if the fall-through it prevents is real.
// This asserts the mechanism rather than trusting the comment: a table with a
// `default` and a missing variant resolves to the default, and that default is
// the tenant-wide one.
const withDefault = narrowing.filter(([, v]) => 'default' in v);
// And what that default actually IS, per table, because they are not all the
// same badness. Most fall through to `tenantWrite` — studio-wide, to a member.
// `people` falls through to `{}` — NO rules at all, which is the whole
// deployment, every tenant. That one is the reason this check is not optional.
const ruleless = withDefault.filter(([, v]) => Object.keys((v['default'] ?? {}) as object).length === 0).map(([t]) => t);
ok(
  '...and the thing it prevents is real: every one of them has a default to fall through TO',
  withDefault.length === narrowing.length,
  ruleless.length === 0
    ? 'each resolves to `default` — studio-wide, to a member'
    : `each resolves to \`default\` — studio-wide for most, and RULE-FREE (every tenant) for: ${ruleless.join(', ')}`,
);

// The household reach's write rules must NOT stamp or match a person. The whole
// design rests on the write subject arriving through a `$lookup` on
// guardianships instead — see behaviors.ts and me.entries.ts. A person rule
// creeping back in here is either a set-valued stamp (which vex now refuses
// outright) or a silent re-pin to the caller, which would make a parent's
// booking their own.
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
