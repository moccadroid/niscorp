// No schema in this file, on purpose: a terminal that only reads a head off
// the wire needs the names and the shape, and nothing to validate with.

export const HEAD_NAME = 'nova:head';
export const HEAD_TITLE_NAME = 'nova:title';
export const HEAD_META_NAME = 'nova:meta';
export const HEAD_LINK_NAME = 'nova:link';
export const HEAD_SCRIPT_NAME = 'nova:script';

export const HEAD_NAMES: readonly string[] = [HEAD_NAME, HEAD_TITLE_NAME, HEAD_META_NAME, HEAD_LINK_NAME, HEAD_SCRIPT_NAME];

export type HeadElement = {
  tag: 'title' | 'meta' | 'link' | 'script';
  attributes: Record<string, string>;
  // A title's words, or a script's data as JSON.
  text?: string;
};

export const headKeyOf = (element: Pick<HeadElement, 'tag' | 'attributes'>): string | undefined => {
  const said = (name: string): string | undefined => {
    const found = Object.entries(element.attributes).find(([key]) => key.toLowerCase() === name)?.[1].trim().toLowerCase();
    return found === undefined || found === '' ? undefined : found;
  };
  if (element.tag === 'title') return 'title';
  if (element.tag === 'meta') {
    const [name, property] = [said('name'), said('property')];
    if (name !== undefined) return `meta name ${name}`;
    return property === undefined ? undefined : `meta property ${property}`;
  }
  if (element.tag === 'link') return (said('rel') ?? '').split(/\s+/).includes('canonical') ? 'link canonical' : undefined;
  return undefined;
};
