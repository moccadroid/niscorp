import { z } from 'zod';
import { ActionDefinitionSchema, LayoutNodeSchema } from '@niscorp/nova';

// What an integration publishes at `<url>/bundle`. Deliberately small — the
// argument for every field it does NOT have is above. Four kinds of content,
// each its own field: WORDS (meta — for the store card, validated against
// nothing), REQUESTS (grants — approved once), ARTIFACTS (actions — pure nova,
// the schema untouched by any of this), and BINDINGS (attachments, placements,
// settings — machine-checked against what the host advertises, refused when
// wrong). Bindings live beside the artifacts, never on them: the binding names
// the action, the action never names its bindings — the same direction layout
// variants point.
// WHAT A BUILDER MAY SET — the add-on's declaration of its own configurable
// behaviour, so the host renders a settings form per add-on the way it renders
// the role editor from `capabilities`. moss validates the DECLARATION and
// carries it; the values a builder sets, where they are stored, how they are
// checked against this on write, and how they reach the service are the host's,
// exactly as with capability ids and fact kinds. moss never reads a value.
//
// EVERY FIELD IS A CLOSED SET — the kit's second law (kit/PRINCIPLES.md): a
// `toggle`, a bounded `number`, a `pick` from declared options, or a
// length-capped `line`. An open number or a free string is a hole with a nicer
// name, and a service made to interpret one has to validate it itself. The kind
// names are the subset of the shared field vocabulary (FieldKind) a builder
// setting may use.
//
// `default` is required on every kind: the form must show a value before a
// builder has touched anything, and the absence of a stored value has to mean
// something definite to the service — the declared default. A bundle that
// declares a field declares what it is when nobody has set it.
const configurationBase = {
  key: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'a configuration key is lowercase words joined by single hyphens'),
  title: z.string().min(1),
  description: z.string().default(''),
};

const configurationSchema = z
  .array(
    z.discriminatedUnion('kind', [
      z.object({ ...configurationBase, kind: z.literal('toggle'), default: z.boolean() }).strict(),
      z.object({ ...configurationBase, kind: z.literal('number'), min: z.number().int(), max: z.number().int(), default: z.number().int() }).strict(),
      z
        .object({
          ...configurationBase,
          kind: z.literal('pick'),
          options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()).min(2),
          default: z.string().min(1),
        })
        .strict(),
      z.object({ ...configurationBase, kind: z.literal('line'), maxLength: z.number().int().positive().max(200), default: z.string() }).strict(),
    ]),
  )
  // Coherence the shape alone cannot state — refused with a sentence, the same
  // posture as the capability-id and settings-action checks, and surfaced
  // through runIntake's own `safeParse` mapping. One key per bundle; a default
  // that sits inside the thing it is a default FOR; options that do not repeat.
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      if (seen.has(field.key)) ctx.addIssue({ code: 'custom', path: [i, 'key'], message: `configuration "${field.key}": declared twice` });
      seen.add(field.key);
      if (field.kind === 'number') {
        if (field.min >= field.max) ctx.addIssue({ code: 'custom', path: [i], message: `configuration "${field.key}": min ${field.min} is not below max ${field.max}` });
        if (field.default < field.min || field.default > field.max) {
          ctx.addIssue({ code: 'custom', path: [i, 'default'], message: `configuration "${field.key}": default ${field.default} is outside [${field.min}, ${field.max}]` });
        }
      } else if (field.kind === 'pick') {
        const values = field.options.map((o) => o.value);
        if (new Set(values).size !== values.length) ctx.addIssue({ code: 'custom', path: [i, 'options'], message: `configuration "${field.key}": option values repeat` });
        if (!values.includes(field.default)) ctx.addIssue({ code: 'custom', path: [i, 'default'], message: `configuration "${field.key}": default "${field.default}" is not one of its options` });
      } else if (field.kind === 'line') {
        if (field.default.length > field.maxLength) {
          ctx.addIssue({ code: 'custom', path: [i, 'default'], message: `configuration "${field.key}": default is longer than maxLength ${field.maxLength}` });
        }
      }
    });
  })
  .default([]);

export type ConfigurationField = z.infer<typeof configurationSchema>[number];

// ── WHAT AN ADD-ON LETS A PERSON EDIT ────────────────────────
//
// The host ships ONE editor and ONE assistant — generic machinery an add-on
// cannot ship and must not copy. This declaration is where an add-on puts the
// content those two read: a `document` is section types (each a set of fields
// and a fragment that draws them over `$.content`) plus a section model. moss
// validates the declaration against what the host holds — the kit registry, the
// bundle's own capabilities and actions, the host's regions and checks — and
// carries it; what the host does with a declared document (which rows hold its
// draft, how publish is delivered) is the host's, exactly as with
// `capabilities` and `configuration`. moss never reads it after intake.

// THE ONE FIELD VOCABULARY. `configuration`'s kinds are the subset
// `toggle | number | pick | line`; a document or block field may be any of
// these. A field is a descriptor for the host's form — flat, unlike a
// configuration entry, which additionally carries a default and per-kind
// bounds because the host has to render a value before a builder sets one.
const FieldKind = z.enum(['line', 'long', 'url', 'pick', 'asset', 'color', 'number', 'toggle', 'list']);

const documentFieldSchema = z
  .object({
    // A data key, or a CSS custom property (`--color-brand`) for a theme token.
    key: z.string().regex(/^[a-z][a-z0-9-]*$|^--[a-z][a-z0-9-]*$/, 'a field key is lowercase-hyphen, optionally a `--` custom property'),
    label: z.string().min(1),
    kind: FieldKind,
    hint: z.string().default(''),
    placeholder: z.string().default(''),
    group: z.string().default(''),
    advanced: z.boolean().default(false),
    // Only meaningful for `pick`; intake refuses a `pick` with fewer than two.
    options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) }).strict()).default([]),
    max: z.number().int().positive().optional(),
  })
  .strict();

const sectionTypeSchema = z
  .object({
    type: z.string().min(1),
    label: z.string().min(1),
    fields: z.array(documentFieldSchema).min(1),
    // The default content a new section of this type starts with.
    starter: z.record(z.string(), z.unknown()).default({}),
    // The nova layout that draws this section over `$.content`. Typed as the
    // real layout schema (not `unknown`) so a malformed fragment is refused at
    // intake by SHAPE, and then walked by `validateLayout` for component/prop
    // existence — the exact rigor an action's own layout gets.
    fragment: LayoutNodeSchema,
  })
  .strict();

// The section model: a FIXED list (the theme's base + dark halves, dark
// extending base) or an OPEN list a person adds to, capped.
const sectionsSchema = z.union([
  z
    .object({
      fixed: z
        .array(
          z.object({ id: z.string().min(1), type: z.string().min(1), label: z.string().min(1), extends: z.string().optional() }).strict(),
        )
        .min(1),
    })
    .strict(),
  z.object({ open: z.object({ max: z.number().int().positive().max(40) }).strict() }).strict(),
]);

const documentDeclarationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'a document id is lowercase words joined by single hyphens'),
    title: z.string().min(1),
    // The capability that opens the editor on this document — one of the
    // bundle's own `capabilities`, so the host's charter can grant it.
    capability: z.string().min(1),
    registry: z.array(sectionTypeSchema).min(1),
    sections: sectionsSchema,
    // Region actions the editor wants when the host's defaults do not fit (a
    // product's stage is a live shell, not fragments). Each is one of the
    // bundle's own actions or a region the host offers.
    regions: z.object({ bar: z.string().optional(), outline: z.string().optional(), stage: z.string().optional(), inspector: z.string().optional() }).strict().default({}),
    // Checks that run before publish (the theme's readability floors), each one
    // the host holds.
    checks: z.array(z.string().min(1)).default([]),
    // Where a published document is delivered: a route under the integration's
    // own prefix. The add-on owns the live rows and the public renderer; the
    // host owns the draft and the revisions.
    publish: z.object({ path: z.string().min(1) }).strict(),
  })
  .strict();

export type DocumentDeclaration = z.infer<typeof documentDeclarationSchema>;

// ── WHAT AN ADD-ON'S ASSISTANT KNOWS ─────────────────────────
//
// The host ships ONE assistant — one thread on every screen, one `say` that
// derives most of its context from the screen itself. What it cannot derive is
// the add-on's own knowledge: its instructions, the reads it may run
// (`grounding`, each a host vex fingerprint under a heading), the block types
// it may render beyond the host's core, its opening offers, the host tools it
// may call, and what it applies to. moss validates the declaration against the
// host's fingerprints and tools and the bundle's own documents and actions, and
// carries it; which thread and which `say` consume it is the host's.

// A block type an assistant may render beyond the host's core — a palette with
// swatches and a "Use this", a section proposal. Fields from the same
// vocabulary as a document's (a `list` IS allowed here — that is the one place
// it is), and a fragment drawn like any other, walked at intake.
const blockTypeSchema = z
  .object({
    type: z.string().min(1),
    label: z.string().min(1),
    fields: z.array(documentFieldSchema).default([]),
    // Data keys the block reads — carried, the block's own contract with its
    // fragment; moss does not resolve them.
    refs: z.array(z.string().min(1)).default([]),
    fragment: LayoutNodeSchema,
  })
  .strict();

const assistantDeclarationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'an assistant id is lowercase words joined by single hyphens'),
    title: z.string().min(1),
    intro: z.string().default(''),
    instructions: z.string().min(1),
    // The reads it may run — each a host vex fingerprint the session may already
    // call, under a heading (`as`) the rows appear beneath. `upfront` fetches at
    // thread start rather than on demand.
    grounding: z
      .array(
        z.object({ as: z.string().min(1), fingerprint: z.string().min(1), context: z.record(z.string(), z.unknown()).default({}), upfront: z.boolean().default(false) }).strict(),
      )
      .default([]),
    // Host tools it may call, from the host's closed set (`floors`, `derive`).
    tools: z.array(z.string().min(1)).default([]),
    blocks: z.array(blockTypeSchema).default([]),
    starters: z.array(z.string().min(1)).max(6).default([]),
    // One of the bundle's own documents, or one of its own screens (actions),
    // so the host can find the row from what is on screen. An add-on attaches an
    // assistant to its own surfaces only.
    applies: z.object({ document: z.string().optional(), screen: z.string().optional() }).strict(),
    modelRole: z.string().optional(),
    // Data keys of the screen the thread is keyed by, and the keys sent to the
    // model (absent = all). Carried; the host's `say` is the consumer.
    subject: z.array(z.string().min(1)).default([]),
    describe: z.array(z.string().min(1)).optional(),
  })
  .strict();

export type AssistantDeclaration = z.infer<typeof assistantDeclarationSchema>;

// WHAT AN INTEGRATION MAY BE CALLED. Its id is a segment of every path it is
// served under (`/integrations/<id>/…`) and a part of every action it ships
// (`ext.<audience>.<id>.<name>`, split on the dots), so it is held to what
// both already assumed: lower-case letters, digits and hyphens, starting with
// a letter. No slash, no dot, nothing a path or a namespace reads as its own.
export const INTEGRATION_ID = /^[a-z][a-z0-9-]*$/;
export const INTEGRATION_ID_RULE = 'An integration id is lower-case letters, digits and hyphens, and starts with a letter.';

export const BundleSchema = z
  .object({
    integration: z.string().regex(INTEGRATION_ID, INTEGRATION_ID_RULE),
    // The store card's words, and the listing page's long form. Title, a
    // line, a paragraph — then the story (sections a page renders in order),
    // the highlight lines, and the press images. Story and highlights are
    // text, enforced as nothing more; press is the one field with teeth: each
    // entry is a path under the integration's own prefix, fetched ONCE at
    // intake and copied to the host (copyPress), never fetched at render
    // time. Strict, unlike before: a typo'd key here used to strip silently,
    // which is not what "intake refuses anything outside the vocabulary"
    // means.
    meta: z
      .object({
        title: z.string().default(''),
        tagline: z.string().default(''),
        description: z.string().default(''),
        story: z.array(z.object({ heading: z.string(), prose: z.string() }).strict()).default([]),
        highlights: z.array(z.string()).default([]),
        press: z.array(z.string()).default([]),
      })
      .strict()
      .default({ title: '', tagline: '', description: '', story: [], highlights: [], press: [] }),
    // What it needs, which an operator approves once at registration. A bundle
    // asking for more than it was approved for goes back to pending rather than
    // silently keeping the old grants and half-working.
    grants: z
      .object({
        actions: z.array(z.string()).default([]),
        data: z.array(z.string()).default([]),
      })
      .default({ actions: [], data: [] }),
    // THE VERBS THIS INTEGRATION GATES ON — the other direction from `grants`.
    // Grants are what it ASKS OF the host (surfaces it may call); a capability
    // is what it OFFERS the host's role editor to grant to PEOPLE, and its own
    // service is the code that checks the grant (`can(who, '<integration>.<id>')`).
    // moss validates shape and carries them, nothing more: WHICH endpoints a
    // capability gates is the integration's contract with its own service,
    // exactly as a fact kind's meaning and `meta`'s words are checked against
    // nothing here. The host composes the full grant string as `<integration>.
    // <id>` — a bundle cannot claim another integration's namespace — which is
    // why the id forbids a dot: it has to stay splittable, the same reason the
    // action namespace does. A capability carries no statement about WHO should
    // hold it: no face, no audience, no population marker. Every role grants it
    // identically, and who holds one is authored data in the host (its role
    // grants), never a declaration here. There is deliberately no gates list —
    // moss could name-check one (it name-checks every other cross-reference
    // below) but no consumer needs it; the field is additive if one appears.
    capabilities: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'a capability id is lowercase words joined by single hyphens, and never a dot'),
            title: z.string().min(1),
          })
          .strict(),
      )
      .default([]),
    // WHAT IT TELLS AND WHAT IT HEARS — the fact kinds this integration
    // publishes and the kinds it consumes. moss validates shape and carries
    // them; what a kind MEANS is the host's contract vocabulary, exactly as
    // `meta` is words validated against nothing. There is no optional flag
    // to declare: the host's laws forbid a hard dependency between
    // integrations, so every need is soft by construction — absence
    // degrades, and the store says so in a sentence the HOST prints.
    offers: z.array(z.string()).default([]),
    needs: z.array(z.string()).default([]),
    // THE GRAMMARS THE ADD-ON WAS BUILT ON — how far along each grammar sequence
    // (nova's, Prism's, the host's kit) its documents are written. The host
    // upgrades them from here before anything else reads them, and refuses a
    // bundle written in a grammar newer than its own. Absent: before stamps.
    grammar: z.record(z.string(), z.number().int().nonnegative()).optional(),
    actions: z.record(z.string(), ActionDefinitionSchema),
    // action id → HOST action it rides on (a panel on the member detail). The
    // host must have declared itself attachable — see IntakeContext (./intake.ts). The long
    // form adds a `preview`: an endpoint under the integration's own prefix that the
    // host calls with the offered identifiers while deriving its strip, and
    // that answers with display atoms — `bands` (colors) and `hint` (a line) —
    // so the rider's row can SHOW the belt, not the word for it, while the
    // host still learns nothing about what a belt is.
    attachments: z
      .record(
        z.string(),
        z.union([z.string(), z.object({ to: z.string(), preview: z.string().default('') }).strict()]),
      )
      .default({}),
    // action id → the MENU HUB it lists under (a roster under People). The hub
    // must be one the host offers to integrations.
    placements: z.record(z.string(), z.string()).default({}),
    // The ONE action allowed to surface in the store: this integration's own
    // settings screen, reachable from its tile and from nowhere else. Add-ons
    // is a store; nothing functional lives there.
    settings: z.string().default(''),
    // THE INTEGRATION'S OWN WORDS, in the languages it speaks — the same
    // `(language, source, text)` shape the host's book uses, keyed by
    // LANGUAGE, never by full locale: Vienna and Hamburg read the same
    // sentences, and region is money and dates, which never come from a
    // book. A malformed key refuses the whole bundle at intake, exactly as a
    // placement outside the vocabulary does. The host merges these under its
    // own book, so an integration can never rename a host word.
    phrasebook: z.record(z.string().regex(/^[a-z]{2}$/, 'a phrasebook is keyed by LANGUAGE (`de`), never by locale (`de-AT`)'), z.record(z.string(), z.string())).default({}),
    // WHAT A BUILDER MAY SET per product — a closed vocabulary of settings the
    // host renders a form from. Carried, never read: the value's meaning is the
    // integration's contract with its own service. See `configurationSchema`.
    configuration: configurationSchema,
    // WHAT AN ADD-ON LETS A PERSON EDIT in the host's editor — section types,
    // fields, fragments, and a section model. See `documentDeclarationSchema`.
    documents: z.array(documentDeclarationSchema).default([]),
    // WHAT AN ADD-ON'S ASSISTANT KNOWS AND MAY DO — instructions, grounding,
    // blocks, tools, and what it applies to. See `assistantDeclarationSchema`.
    assistants: z.array(assistantDeclarationSchema).default([]),
  })
  .strict();

export type Bundle = z.infer<typeof BundleSchema>;
