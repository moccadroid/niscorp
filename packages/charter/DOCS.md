# Charter — API Reference

Every export of `@niscorp/charter`. The package is a pure function library: no
state, no I/O, no side effects.

## Types

### `Charter`

```typescript
type Charter = Record<string, RoleDef>;
```

The document: role name → role definition.

### `RoleDef`

```typescript
type RoleDef =
  | string[]                        // sugar: an actions-only role
  | {
      extends?: string[];           // compose whole roles (per section)
      without?: string[];           // subtract whole roles (per section)
      allow?: string[];             // sugar → actions.allow
      deny?: string[];              // sugar → actions.deny
      actions?: Selection;          // the actions universe
      data?: Selection;             // the data universe
    };
```

A bare `string[]` is an actions-only role. Top-level `allow`/`deny` are sugar
for the `actions` section — an actions-only role never names a section. Using
both the sugar and an explicit `actions:` on one role is an error (the verifier
catches it).

### `Selection`

```typescript
type Selection = string[] | { allow?: string[]; deny?: string[] };
```

Within a section: a bare glob list (sugar for `{ allow }`) or explicit
`allow`/`deny`.

### `Section`

```typescript
type Section = 'actions' | 'data';
```

Which universe a selection resolves in.

---

## Globs

### `matchGlob(pattern, id): boolean`

One wildcard: `*` matches any run of characters, including dots. `matchGlob('crm.*', 'crm.deal.form')` is `true`. No `**`, no braces, no regex.

### `matchAll(patterns, ids): Set<string>`

Every id in `ids` selected by any pattern in `patterns`.

---

## Resolution

### `resolveRole(charter, universe, role, section, memo?, visiting?): ReadonlySet<string>`

Resolve one role in one section against `universe`. Applies the algebra
(`extends` ∪ `allow` − `deny` − `without`). `memo` and `visiting` are internal
accumulators for recursion and cycle detection; callers pass neither.

Throws `CharterError` on an unknown role reference or a role cycle.

### `resolvePrincipal(charter, universe, roles, section?): Set<string>`

The union of the resolved sets for every role the principal wears, in one
section. `section` defaults to `'actions'`. This is the function a server calls
at login.

```typescript
resolvePrincipal(charter, actionIds, ['sales', 'dev'], 'actions'); // granted actions
resolvePrincipal(charter, verbLeaves, ['sales', 'dev'], 'data');   // granted table.verb caps
```

### `normalizeRole(def, section): { allow, deny, extends, without }`

The atoms of one role for one section, with sugar expanded. Exposed for tools
that inspect a role's raw selection (the verifier uses it); most callers want
`resolveRole`.

### `CharterError`

Thrown by the resolver for unknown-role and cycle errors. `verifyCharter`
catches these and reports them as `resolution` errors rather than throwing.

---

## Verification

### `verifyCharter(charter, universes, assignments?, closure?): VerifyReport`

Run every coherence check against both universes. Call at boot/CI; refuse to
serve if `report.errors` is non-empty.

- `universes: { actions: readonly string[]; data: readonly string[] }` — the id
  sets each section resolves against, handed in by the composer.
- `assignments?: Record<string, readonly string[]>` — `principal → roles`, used
  by the `subtractive-assigned` check.
- `closure?: ClosureAuditor` — the injected per-role cross-action audit.

### `ClosureAuditor`

```typescript
type ClosureAuditor = (grantedIds: readonly string[]) => string[];
```

Given a role's resolved action ids, return the cross-action wiring problems
inside that closure. Supplied by the consumer that owns actions (Nova exports
`auditClosure(definitions)`; moss wraps it).

### `VerifyReport`

```typescript
type VerifyReport = {
  errors: VerifyIssue[];       // refuse to boot if non-empty
  warnings: VerifyIssue[];     // deploy, but review
  perRole: RoleClosure[];      // resolved actions + data + closure issues, per role
};

type VerifyIssue = { level: 'error' | 'warning'; rule: string; detail: string };
type RoleClosure = { role: string; actions: string[]; data: string[]; issues: string[] };
```

### The checks

| rule | level | meaning |
|---|---|---|
| `resolution` | error | a cycle or unknown-role reference (per section) |
| `leaves-only` | error | an id is a namespace of another id — namespaces are never actions |
| `ambiguous-selection` | error | a role has both top-level `allow`/`deny` and an explicit `actions:` |
| `dead-deny` | error | a deny glob matches nothing — silent means unprotected |
| `dead-allow` | warning | an allow glob matches nothing — noise |
| `orphan` | warning | an action granted by no role — deployed but unreachable |
| `re-allow` | warning | a role re-allows an id an ancestor denied |
| `subtractive-assigned` | warning | a role used in `without` is also assigned to a principal |
| *(closure)* | via `RoleClosure.issues` | cross-action wiring problems from the injected auditor |

---

## Usage pattern

```typescript
import { resolvePrincipal, verifyCharter } from '@niscorp/charter';

// 1. Boot: derive the universes from the governed targets, refuse incoherence.
const universes = {
  actions: Object.keys(app.actions),        // the shell's dialect
  data: scopeGrants(schema.tables),          // vex's dialect
};
const report = verifyCharter(app.charter, universes, app.assignments, auditClosure(app.actions));
if (report.errors.length > 0) {
  throw new Error(report.errors.map((e) => `${e.rule}: ${e.detail}`).join('\n'));
}

// 2. Per login: resolve, hand the sets to the enforcers.
const grantedActions = resolvePrincipal(app.charter, universes.actions, roles, 'actions');
const grantedData = resolvePrincipal(app.charter, universes.data, roles, 'data');
const policy = createScopePolicy(grantedData, app.behaviors); // vex enforces
// the shell mounts only grantedActions
```
