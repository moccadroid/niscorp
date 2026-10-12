import type { Config } from '../schemas/config.schema';
import type { OpKey } from '../schemas/profiles';
import type { JsonObject, JsonValue } from '../types';

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
  id: string;
  group: PrismExampleGroup;
  title: string;
  description: string;
  op?: OpKey;
  source: JsonObject;
  config: Config;
  expected: JsonValue;
};
