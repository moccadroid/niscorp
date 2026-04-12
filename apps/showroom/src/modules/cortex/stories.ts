// ═══════════════════════════════════════════════════════════
// Cortex demo stories
// ═══════════════════════════════════════════════════════════
//
// Each story is a Cortex feature demo. Sidebar grouping is by `kind`
// (the Cortex feature) and `category` (the sub-group within the kind).
// The runner discriminates by `demo` (the specific runner to invoke).

import type { CortexStory } from './story-types';
import { personExtractorAgent } from './agents/structured-extract';

// ═══════════════════════════════════════════════════════════
// STANDALONE — runAgentStandalone, single LLM call (or call+retry)
// ═══════════════════════════════════════════════════════════

// ─── Structured extract (generic, no Prism) ───────────────

const extractAda: CortexStory = {
  id: 'standalone.extract.ada',
  name: 'Ada Lovelace bio',
  description:
    'Pull a structured Person record out of a paragraph of free-form text. The simplest Cortex use case: defineAgent + outputSchema, one call, typed result.',
  category: 'Structured output (generic)',
  kind: 'standalone',
  demo: 'structured-extract',
  agent: personExtractorAgent,
  inputText:
    'Ada Lovelace was a 19th-century English mathematician living in London. She is regarded as the first computer programmer for her work on Charles Babbage\'s Analytical Engine. She died in 1852 at the age of 36.',
  expectedFields: { name: 'Ada Lovelace', age: 36, location: 'London' },
};

const extractTuring: CortexStory = {
  id: 'standalone.extract.turing',
  name: 'Alan Turing fragment',
  description:
    'A shorter, less explicit text. Tests how the agent handles missing fields — they should come back as null, not invented.',
  category: 'Structured output (generic)',
  kind: 'standalone',
  demo: 'structured-extract',
  agent: personExtractorAgent,
  inputText:
    'Alan Turing was a British mathematician and computer scientist who broke German codes during WWII.',
  expectedFields: { name: 'Alan Turing' },
};

// ─── Prism mapping (deep schema demo) ─────────────────────

const fullNameAge: CortexStory = {
  id: 'standalone.prism-mapping.full-name-age',
  name: 'Full name + age',
  description:
    'Cortex validates the agent\'s output against an envelope schema that embeds Prism\'s ConfigSchema directly — so the deep Prism Node tree is validated end-to-end on every call. Validation failures auto-retry. The Prism payload is the example; the substrate is the point.',
  category: 'Structured output (Prism mapping)',
  kind: 'standalone',
  demo: 'prism-mapping',
  sampleInput: {
    first: 'Ada',
    last: 'Lovelace',
    born: 1815,
  },
  expected: {
    fullName: 'Ada Lovelace',
    age: 211,
  },
  fieldDescriptions: {
    fullName: 'first and last joined with a single space.',
    age: 'Years between `born` and 2026 (the current year).',
  },
};

const productSummary: CortexStory = {
  id: 'standalone.prism-mapping.product-summary',
  name: 'Product → display card',
  description:
    'Take a raw product record and produce a display card with formatted price and an availability flag.',
  category: 'Structured output (Prism mapping)',
  kind: 'standalone',
  demo: 'prism-mapping',
  sampleInput: {
    sku: 'SKU-42',
    name: 'Mechanical Keyboard',
    price: 149.99,
    currency: 'USD',
    stock: 7,
  },
  expected: {
    title: 'Mechanical Keyboard',
    priceLabel: 'USD 149.99',
    inStock: true,
  },
  fieldDescriptions: {
    title: 'Just the product name.',
    priceLabel: 'currency followed by a space then the price.',
    inStock: 'true if stock is greater than zero.',
  },
};

const flattenContact: CortexStory = {
  id: 'standalone.prism-mapping.flatten-contact',
  name: 'Flatten nested contact',
  description:
    'A nested contact record with address.* fields. The mapping must flatten and rename. Tests the agent on nested $ref paths.',
  category: 'Structured output (Prism mapping)',
  kind: 'standalone',
  demo: 'prism-mapping',
  sampleInput: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    address: {
      city: 'Berlin',
      country: 'DE',
    },
  },
  expected: {
    name: 'Jane Doe',
    email: 'jane@example.com',
    city: 'Berlin',
    country: 'DE',
  },
  fieldDescriptions: {
    city: 'Read from address.city.',
    country: 'Read from address.country.',
  },
};

// ═══════════════════════════════════════════════════════════
// Barrel — tool-use and plan-mode stories appended below as
// each demo is added (rounds B and C).
// ═══════════════════════════════════════════════════════════

import { weatherStories } from './stories/tool-use.stories';
import { planModeStories } from './stories/plan-mode.stories';
import { rulesStories } from './stories/rules.stories';

export const stories: readonly CortexStory[] = [
  // STANDALONE
  extractAda,
  extractTuring,
  fullNameAge,
  productSummary,
  flattenContact,
  // TOOL USE
  ...weatherStories,
  // PLAN MODE
  ...planModeStories,
  // RULES ENGINE (Phase C)
  ...rulesStories,
];
