import type { LoomStory } from './story-types';
import { story as fields } from './stories/fields.story';
import { story as validation } from './stories/validation.story';
import { story as nested } from './stories/nested.story';
import { story as arrays } from './stories/arrays.story';
import { story as recursion } from './stories/recursion.story';
import { story as union } from './stories/union.story';
import { story as structuralUnion } from './stories/structural-union.story';
import { story as twoKits } from './stories/two-kits.story';
import { story as pluginsIntro } from './stories/plugins-intro.story';
import { story as gradient } from './stories/gradient.story';
import { story as loomEditor } from './stories/loom-editor.story';
import { story as vexQuery } from './stories/vex-query.story';
import { story as prismConfig } from './stories/prism-config.story';

export const stories: readonly LoomStory[] = [
  fields,
  validation,
  nested,
  arrays,
  recursion,
  union,
  structuralUnion,
  twoKits,
  pluginsIntro,
  gradient,
  loomEditor,
  vexQuery,
  prismConfig,
];
