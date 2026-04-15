import type { PrismStory } from './story-types';

// Operators
import { story as constStory } from './stories/ops/const.story';
import { story as refStory } from './stories/ops/ref.story';
import { story as withStory } from './stories/ops/with.story';
import { story as addStory } from './stories/ops/add.story';
import { story as mapStory } from './stories/ops/map.story';
import { story as filterStory } from './stories/ops/filter.story';
import { story as reduceStory } from './stories/ops/reduce.story';
import { story as caseStory } from './stories/ops/case.story';
import { story as interpolateStory } from './stories/ops/interpolate.story';
import { story as coalesceStory } from './stories/ops/coalesce.story';
import { story as mergeStory } from './stories/ops/merge.story';
import { story as pickStory } from './stories/ops/pick.story';
import { story as omitStory } from './stories/ops/omit.story';
import { story as keysValuesStory } from './stories/ops/keys-values.story';
import { story as predicatesStory } from './stories/ops/predicates.story';
import { story as logicStory } from './stories/ops/logic.story';
import { story as stringsStory } from './stories/ops/strings.story';
import { story as keyByStory } from './stories/ops/key-by.story';
import { story as datesStory } from './stories/ops/dates.story';

// Sugar
import { story as sumStory } from './stories/sugar/sum.story';
import { story as countStory } from './stories/sugar/count.story';
import { story as avgStory } from './stories/sugar/avg.story';
import { story as minStory } from './stories/sugar/min.story';
import { story as maxStory } from './stories/sugar/max.story';
import { story as pluckStory } from './stories/sugar/pluck.story';
import { story as takeStory } from './stories/sugar/take.story';
import { story as dropStory } from './stories/sugar/drop.story';
import { story as matchStory } from './stories/sugar/match.story';
import { story as flatMapStory } from './stories/sugar/flat-map.story';

// Composition
import { story as pickAndRenameStory } from './stories/compose/pick-and-rename.story';
import { story as mapShapeStory } from './stories/compose/map-shape.story';
import { story as filterThenMapStory } from './stories/compose/filter-then-map.story';
import { story as calculatedFieldsStory } from './stories/compose/calculated-fields.story';
import { story as denormalizeJoinStory } from './stories/compose/denormalize-join.story';

// Real world
import { story as apiToUiStory } from './stories/real-world/api-to-ui.story';
import { story as groupByStory } from './stories/real-world/group-by.story';
import { story as sortAndSliceStory } from './stories/real-world/sort-and-slice.story';
import { story as searchSortPaginateStory } from './stories/real-world/search-sort-paginate.story';
import { story as analyticsSummaryStory } from './stories/real-world/analytics-summary.story';

export const stories: readonly PrismStory[] = [
  // Operators
  constStory,
  refStory,
  withStory,
  addStory,
  mapStory,
  filterStory,
  reduceStory,
  caseStory,
  interpolateStory,
  coalesceStory,
  mergeStory,
  pickStory,
  omitStory,
  keysValuesStory,
  predicatesStory,
  logicStory,
  stringsStory,
  keyByStory,
  datesStory,
  // Sugar
  sumStory,
  countStory,
  avgStory,
  minStory,
  maxStory,
  pluckStory,
  takeStory,
  dropStory,
  matchStory,
  flatMapStory,
  // Composition
  pickAndRenameStory,
  mapShapeStory,
  filterThenMapStory,
  calculatedFieldsStory,
  denormalizeJoinStory,
  // Real world
  apiToUiStory,
  groupByStory,
  sortAndSliceStory,
  searchSortPaginateStory,
  analyticsSummaryStory,
];
