import type { Config } from '../schemas/config.schema';
import type { OpKey } from '../schemas/profiles';
import type { JsonObject, JsonValue } from '../types';

// ═══════════════════════════════════════════════════════════
// An example of Prism — a config, what it is given, and what
// must come out
// ═══════════════════════════════════════════════════════════
//
// Examples are DATA, and they ship with the package. Whoever shows them — a
// documentation site, a coding agent reading node_modules — reads them from
// here and runs them with the same `evaluate` an app would, so what is shown
// cannot fall behind what the installed version does. test/examples.test.ts
// evaluates every one against its `expected`, and holds that every operator
// has exactly one example of its own.

export type PrismExampleGroup =
  | 'core'
  | 'arrays'
  | 'math'
  | 'strings'
  | 'predicates'
  | 'logic'
  | 'structure'
  | 'objects'
  | 'transform'
  | 'time'
  | 'locale'
  | 'sugar'
  | 'composition'
  | 'real-world';

export type PrismExample = {
  // Stable and unique across the set; kebab-case. An address can be built on it.
  id: string;
  group: PrismExampleGroup;
  // The operator's own name where the example is an operator's (`$map`); a few
  // plain words where it is about several working together.
  title: string;
  // One to three sentences: what it does and what it is for.
  description: string;
  // The operator this example is the reference for. Every operator has exactly
  // one, and its `title` is that operator. Absent where the example is about
  // combining them.
  op?: OpKey;
  // What the config is evaluated against.
  source: JsonObject;
  config: Config;
  // What `evaluate(config, source)` returns.
  expected: JsonValue;
};
