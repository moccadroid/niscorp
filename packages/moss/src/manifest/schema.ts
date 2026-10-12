import { z } from 'zod';
import { ActionDefinitionSchema, ActionFragmentSchema, LayoutNodeSchema } from '@niscorp/nova';
import { ConfigSchema } from '@niscorp/prism';
import { SequenceSchema, depthRefusal, exceedsDepth } from '@niscorp/strata';
import { MutationDefinitionSchema, QuerySchema, REFRESH_MODES } from '@niscorp/vex';
import type { NiscApp } from './app';

const seam = z.custom<(...args: never[]) => unknown>((value) => typeof value === 'function', 'expected a function');

// Depth is checked before a recursive schema reads the value: one nested a few
// thousand levels deep would throw RangeError out of the parser instead of
// coming back refused. `abort` keeps the schema from being asked.
const document = <Schema extends z.ZodType>(schema: Schema): z.ZodPipe<z.ZodUnknown, Schema> =>
  z
    .unknown()
    .refine((value) => !exceedsDepth(value), { message: depthRefusal(), abort: true })
    .pipe(schema);

const strings = z.array(z.string()).readonly();
const record = z.record(z.string(), z.unknown());
const layout = document(LayoutNodeSchema);

const LayoutVariantSchema = z.object({ action: z.string(), layout }).strict();

const CanvasSeedSchema = z.union([z.string(), z.object({ action: z.string(), input: record.optional(), with: strings.optional() }).strict()]);

const CanvasSchema = z
  .object({
    id: z.string(),
    mode: z.enum(['stack', 'list']).optional(),
    actionLayout: z.union([z.string(), layout]).optional(),
    initial: z.union([CanvasSeedSchema, z.array(CanvasSeedSchema)]).optional(),
  })
  .strict();

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

const FeatureSchema = z.looseObject({
  name: z.string(),
  tables: z.object({ names: strings, sequences: z.array(SequenceSchema).readonly().optional() }).strict().optional(),
  start: seam,
});

const ReactionSchema = z.object({ table: z.string(), op: z.enum(['insert', 'update', 'delete']).optional(), run: seam }).strict();

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
  resources: z.record(z.string(), z.union([strings, z.looseObject({ entities: strings })])).optional(),
  shell: ShellManifestSchema.optional(),
  pages: z.record(z.string(), PageManifestSchema).optional(),
  grammars: z.array(SequenceSchema).readonly().optional(),
  functions: seam.optional(),
  onSession: seam.optional(),
  runs: seam.optional(),
  reactions: z.array(ReactionSchema).readonly().optional(),
} satisfies Record<keyof NiscApp, z.ZodType>;

const ManifestSchema = z.object(fields).strict();

type Issue = z.core.$ZodIssue;
type Place = { path: readonly PropertyKey[]; message: string };

// Of a union's branches, the one reported is the one that got furthest into the
// value before it failed; on a tie, the one with the fewest complaints.
const placesOf = (issue: Issue, under: readonly PropertyKey[]): Place[] => {
  const path = [...under, ...issue.path];
  if (issue.code !== 'invalid_union') return [{ path, message: issue.message }];
  const branches = issue.errors.map((branch) => branch.flatMap((inner) => placesOf(inner, path))).filter((branch) => branch.length > 0);
  const reach = (places: readonly Place[]): number => Math.max(...places.map((place) => place.path.length));
  const closer = (best: Place[], branch: Place[]): Place[] => (reach(branch) > reach(best) || (reach(branch) === reach(best) && branch.length < best.length) ? branch : best);
  const [first, ...others] = branches;
  return first === undefined ? [{ path, message: issue.message }] : others.reduce(closer, first);
};

export const manifestMisfits = (app: unknown): string[] => {
  const read = ManifestSchema.safeParse(app);
  if (read.success) return [];
  return read.error.issues.flatMap((issue) => placesOf(issue, [])).map((place) => `${place.path.map(String).join('.') || '(the manifest)'}: ${place.message}`);
};

// A class instance is not data and stays unfrozen: a kit hands a component's
// props over as a zod schema, which fills itself in as it is used.
const isData = (value: object): boolean => {
  if (Array.isArray(value)) return true;
  const made: unknown = Object.getPrototypeOf(value);
  return made === Object.prototype || made === null;
};

export const freezeDeep = (data: unknown): void => {
  const seen = new Set<object>();
  const pending: unknown[] = [data];
  while (pending.length > 0) {
    const value = pending.pop();
    if (typeof value !== 'object' || value === null || !isData(value) || seen.has(value)) continue;
    seen.add(value);
    Object.freeze(value);
    for (const inner of Object.values(value)) pending.push(inner);
  }
};

export const receiveManifest = (app: NiscApp): void => {
  // The `satisfies` fails the build where the schema reads a field more
  // narrowly than `NiscApp` declares it, which would otherwise refuse a boot.
  const misfits = manifestMisfits(app satisfies z.input<typeof ManifestSchema>);
  if (misfits.length > 0) throw new Error(['The manifest does not parse — refusing to serve:', ...misfits.map((misfit) => `  ${misfit}`)].join('\n'));
  freezeDeep(app);
};
