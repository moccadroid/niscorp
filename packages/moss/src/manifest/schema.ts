import { z } from 'zod';
import { ActionDefinitionSchema, ActionFragmentSchema, LayoutNodeSchema } from '@niscorp/nova';
import { ConfigSchema } from '@niscorp/prism';
import { SequenceSchema, depthRefusal, exceedsDepth } from '@niscorp/strata';
import { MutationDefinitionSchema, QuerySchema, REFRESH_MODES } from '@niscorp/vex';
import type { NiscApp } from './app';

// ═══════════════════════════════════════════════════════════════
// WHAT AN APP HANDS OVER, READ WHERE IT ARRIVES.
//
// `NiscApp` is a type, and a type is a promise the compiler checks only where
// the manifest is written. What reaches `createServer` may have come out of
// `JSON.parse`, through a cast, or from a file with no types at all — and it
// was used as it stood: a definition nova refuses was found when a shell that
// holds it was built, for whoever connected first, and a seam that was not a
// function when it was first called. So the manifest is read by a schema once,
// before anything is derived from it, and a boot that cannot read it refuses
// with every place that does not fit.
//
// Each grammar is read by the schema of the package that owns it: an action, a
// fragment and a layout by nova's, a query and a mutation by vex's, a mapping
// by Prism's, a grammar sequence by strata's. What is written here is only the
// shapes nobody else owns: a layout variant, a canvas, the envelope of an
// entry, the lists and records.
//
// Two documents have no schema where they are owned, and none is written for
// them here: the charter (verified by ./verify.ts, with the charter engine)
// and the behaviors (compiled by vex with every policy). They are held to
// being records, so what reads them next is handed an object.
// ═══════════════════════════════════════════════════════════════

// A SEAM IS CODE. All a schema can hold it to is that it is a function; what it
// takes and answers is the compiler's to check, where the app is written.
const seam = z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function', 'expected a function');

// A DOCUMENT IN A RECURSIVE GRAMMAR (a layout's children, a query's `and`, a
// Prism `$if`) is asked how deep it nests before its schema reads it: a
// recursive schema recurses on the call stack, so a document a few thousand
// levels deep does not come back refused, it throws RangeError out of the
// parser (strata, depth.ts). `abort` is what stops the schema being asked.
const document = <Schema extends z.ZodType>(schema: Schema): z.ZodPipe<z.ZodUnknown, Schema> =>
  z
    .unknown()
    .refine((value) => !exceedsDepth(value), { message: depthRefusal(), abort: true })
    .pipe(schema);

// The lists are `readonly` as `NiscApp` has them, so the type an app is
// written against is one this schema takes (./handover.ts holds it to that).
const strings = z.array(z.string()).readonly();
const record = z.record(z.string(), z.unknown());
const layout = document(LayoutNodeSchema);

// Ring 2: one action's layout, reshaped for whoever is granted the variant.
const LayoutVariantSchema = z.object({ action: z.string(), layout }).strict();

// What a canvas starts with: an action id, or an action with its input and the
// fragments it is composed with.
const CanvasSeedSchema = z.union([z.string(), z.object({ action: z.string(), input: record.optional(), with: strings.optional() }).strict()]);

const CanvasSchema = z
  .object({
    id: z.string(),
    mode: z.enum(['stack', 'list']).optional(),
    actionLayout: z.union([z.string(), layout]).optional(),
    initial: z.union([CanvasSeedSchema, z.array(CanvasSeedSchema)]).optional(),
  })
  .strict();

// A component's contract is the kit's own record (nova's `ComponentMeta`, with
// whatever else the kit keeps beside it), so it is read loosely: `description`
// is held to being text, `propsSchema` is whatever the kit hands over (a zod
// schema, a JSON Schema), and the rest is left on it.
const ComponentContractSchema = z.looseObject({ meta: z.looseObject({ description: z.string().optional() }).optional() });

const shell = {
  canvases: z.array(CanvasSchema),
  layout: layout.optional(),
  layoutStore: z.record(z.string(), layout).optional(),
  fragments: z.record(z.string(), document(ActionFragmentSchema)).optional(),
  seeds: seam.optional(),
  components: z.record(z.string(), ComponentContractSchema).optional(),
  inputs: seam.optional(),
};
const ShellManifestSchema = z.object(shell).strict();
const PageManifestSchema = z.object({ ...shell, path: z.string(), params: z.string().optional() }).strict();

// An entry is vex's cache row before it is seeded: a read carries a query, a
// write a mutation, and the two share what names them.
const entry = { fingerprint: z.string(), intent: z.string().optional(), reach: z.string().optional() };
const ReadEntrySchema = z
  .object({
    ...entry,
    shape: z.unknown().optional(),
    dsl: document(QuerySchema),
    mapping: document(ConfigSchema).optional(),
    refresh: z.enum(REFRESH_MODES).optional(),
  })
  .strict();
const WriteEntrySchema = z.object({ ...entry, mutation: document(MutationDefinitionSchema) }).strict();

// A feature is the app's code: a name, the tables it keeps (strata sequences,
// read by strata's schema), and the function the server starts it with. What
// else it carries is its own (the calls an app makes on it), so it is read
// loosely and never looked inside.
const FeatureSchema = z.looseObject({ name: z.string(), tables: z.array(SequenceSchema).readonly().optional(), start: seam });

const ReactionSchema = z.object({ table: z.string(), op: z.enum(['insert', 'update', 'delete']).optional(), run: seam }).strict();

// EVERY FIELD OF `NiscApp`, AND NO OTHER: `satisfies` fails the build when the
// type gains a field this does not read, or loses one it still names. Without
// it a new field would be refused at every boot as a key nobody recognises.
const fields = {
  charter: record,
  assignments: z.record(z.string(), strings).optional(),
  wearable: z.array(strings).readonly().optional(),
  actions: z.record(z.string(), document(ActionDefinitionSchema)),
  layouts: z.record(z.string(), LayoutVariantSchema).optional(),
  behaviors: z.record(z.string(), record).optional(),
  scope: seam.optional(),
  identity: z.object({ as: z.string().optional(), resolve: seam }).strict().optional(),
  phrases: seam.optional(),
  phraseKeys: z.object({ props: strings.optional(), suffixes: strings.optional(), text: z.boolean().optional() }).strict().optional(),
  features: z.array(FeatureSchema).readonly().optional(),
  entries: z.array(z.union([ReadEntrySchema, WriteEntrySchema])).readonly().optional(),
  // A resource is a list of entities, or the app's own record carrying one.
  resources: z.record(z.string(), z.union([strings, z.looseObject({ entities: strings })])).optional(),
  shell: ShellManifestSchema.optional(),
  pages: z.record(z.string(), PageManifestSchema).optional(),
  grammars: z.array(SequenceSchema).readonly().optional(),
  functions: seam.optional(),
  onSession: seam.optional(),
  runs: seam.optional(),
  reactions: z.array(ReactionSchema).readonly().optional(),
  facts: z.object({ tide: seam, identity: seam, chain: seam.optional() }).strict().optional(),
} satisfies Record<keyof NiscApp, z.ZodType>;

export const ManifestSchema = z.object(fields).strict();

type Issue = z.core.$ZodIssue;
type Place = { path: readonly PropertyKey[]; message: string };

// WHICH OF A UNION'S REASONS TO SAY. A layout node is one of seven things and
// an entry one of two, so what does not fit comes back as one issue where the
// union stands, carrying every branch's reasons. The branch somebody meant is
// the one that got furthest into the value before it failed; on a tie, the
// one with the fewest complaints.
const placesOf = (issue: Issue, under: readonly PropertyKey[]): Place[] => {
  const path = [...under, ...issue.path];
  if (issue.code !== 'invalid_union') return [{ path, message: issue.message }];
  const branches = issue.errors.map((branch) => branch.flatMap((inner) => placesOf(inner, path))).filter((branch) => branch.length > 0);
  const reach = (places: readonly Place[]): number => Math.max(...places.map((place) => place.path.length));
  const closer = (best: Place[], branch: Place[]): Place[] => (reach(branch) > reach(best) || (reach(branch) === reach(best) && branch.length < best.length) ? branch : best);
  const [first, ...others] = branches;
  return first === undefined ? [{ path, message: issue.message }] : others.reduce(closer, first);
};

// Each place in the manifest that does not parse, as `where: what was
// expected there`. Empty: the manifest is read.
export const manifestMisfits = (app: unknown): string[] => {
  const read = ManifestSchema.safeParse(app);
  if (read.success) return [];
  return read.error.issues.flatMap((issue) => placesOf(issue, [])).map((place) => `${place.path.map(String).join('.') || '(the manifest)'}: ${place.message}`);
};
