// The deal entity — its three actions and their read/write prism seams. One
// import for the shell to register the whole entity.
//
//   deals       — the collection (table + board, one action / two layouts)
//   deal        — the single deal (workspace)
//   deal.form   — create AND edit (one action; the `upsert` mutation desugars insert/update by `id`)
export { dealsAction } from './deals.action';
export { dealAction } from './deal.action';
export { dealFormAction } from './deal.form.action';

// Ray's `find_records` reuses the list prism (the only one needed outside the domain).
export { listDealsPrism } from './deals.prism';
