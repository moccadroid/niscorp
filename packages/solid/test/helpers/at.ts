export const lastOf = <T>(items: readonly T[]): T => {
  const item = items[items.length - 1];
  if (item === undefined) throw new Error(`expected a last item, but the list is empty`);
  return item;
};

export const at = <T>(items: readonly T[], index: number): T => {
  const item = items[index];
  if (item === undefined) throw new Error(`expected an item at ${index}, but the list holds ${items.length}`);
  return item;
};
