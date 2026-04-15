import * as demo from './search-sort-paginate.demo';
import source from './search-sort-paginate.demo?raw';

export const story = {
  id: 'search-sort-paginate',
  name: 'Search → sort → paginate',
  description: 'The classic list-view pipeline: filter by search term, sort by a field, paginate. Each stage feeds the next. Uses `$match` for the search (sugar over `$filter + $contains`), `$sortBy` for the sort, and `$take`/`$drop` for paging.',
  category: 'Real world',
  kind: 'transform' as const,
  ...demo,
  source,
};
