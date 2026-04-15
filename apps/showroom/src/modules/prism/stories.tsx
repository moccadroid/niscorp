import type { Story } from '../types';
import { Runner } from './runner';
import { getStorySource } from './stories/source-map';
import type { PrismStory } from './story-types';

// Operators
import { constStory } from './stories/ops/const';
import { refStory } from './stories/ops/ref';
import { withStory } from './stories/ops/with';
import { addStory } from './stories/ops/add';
import { mapStory } from './stories/ops/map';
import { filterStory } from './stories/ops/filter';
import { reduceStory } from './stories/ops/reduce';
import { caseStory } from './stories/ops/case';
import { interpolateStory } from './stories/ops/interpolate';
import { coalesceStory } from './stories/ops/coalesce';
import { mergeStory } from './stories/ops/merge';
import { pickStory } from './stories/ops/pick';
import { omitStory } from './stories/ops/omit';
import { keysValuesStory } from './stories/ops/keys-values';
import { predicatesStory } from './stories/ops/predicates';
import { logicStory } from './stories/ops/logic';
import { stringsStory } from './stories/ops/strings';
import { keyByStory } from './stories/ops/key-by';
import { datesStory } from './stories/ops/dates';

// Sugar
import { sumStory } from './stories/sugar/sum';
import { countStory } from './stories/sugar/count';
import { avgStory } from './stories/sugar/avg';
import { minStory } from './stories/sugar/min';
import { maxStory } from './stories/sugar/max';
import { pluckStory } from './stories/sugar/pluck';
import { takeStory } from './stories/sugar/take';
import { dropStory } from './stories/sugar/drop';
import { matchStory } from './stories/sugar/match';
import { flatMapStory } from './stories/sugar/flat-map';

// Composition
import { pickAndRenameStory } from './stories/compose/pick-and-rename';
import { mapShapeStory } from './stories/compose/map-shape';
import { filterThenMapStory } from './stories/compose/filter-then-map';
import { calculatedFieldsStory } from './stories/compose/calculated-fields';
import { denormalizeJoinStory } from './stories/compose/denormalize-join';

// Real world
import { apiToUiStory } from './stories/real-world/api-to-ui';
import { groupByStory } from './stories/real-world/group-by';
import { sortAndSliceStory } from './stories/real-world/sort-and-slice';
import { searchSortPaginateStory } from './stories/real-world/search-sort-paginate';
import { analyticsSummaryStory } from './stories/real-world/analytics-summary';

const raw: readonly PrismStory[] = [
  constStory, refStory, withStory, addStory, mapStory, filterStory, reduceStory,
  caseStory, interpolateStory, coalesceStory, mergeStory, pickStory, omitStory,
  keysValuesStory, predicatesStory, logicStory, stringsStory, keyByStory, datesStory,
  sumStory, countStory, avgStory, minStory, maxStory, pluckStory, takeStory,
  dropStory, matchStory, flatMapStory,
  pickAndRenameStory, mapShapeStory, filterThenMapStory, calculatedFieldsStory, denormalizeJoinStory,
  apiToUiStory, groupByStory, sortAndSliceStory, searchSortPaginateStory, analyticsSummaryStory,
];

// Wrap each PrismStory as a chrome Story. Demo renders input/config/
// output via the shared Runner; source comes from the source-map.
export const stories: readonly Story[] = raw.map((s): Story => ({
  ...s,
  Demo: () => <Runner story={s} />,
  source: getStorySource(s.id),
}));
