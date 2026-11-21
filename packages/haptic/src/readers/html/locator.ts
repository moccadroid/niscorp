import { parse as parseSelector } from 'css-what';
import { load } from 'cheerio';
import { compile } from 'css-select';
import type { AnyNode, Element } from 'domhandler';
const syntaxDocument = load('');
export class HtmlSelectorError extends Error {}
const invalidSelector = (message: string): HtmlSelectorError =>
  new HtmlSelectorError(`HTML_SELECTOR: ${message}`);
const readLocator = (selector: string): ReturnType<typeof parseSelector> => {
  let groups: ReturnType<typeof parseSelector>;
  try {
    groups = parseSelector(selector);
  } catch (error) {
    throw invalidSelector(error instanceof Error ? error.message : 'Malformed selector');
  }
  const inspect = (selectors: typeof groups): void => {
    if (!selectors.length || selectors.some((group) => !group.length))
      throw invalidSelector('Nonempty selectors required');
    for (const group of selectors)
      for (const token of group) {
        if ('namespace' in token && token.namespace !== null)
          throw invalidSelector('Namespace unsupported');
        if (token.type === 'adjacent' || token.type === 'sibling') continue;
        if (
          token.type === 'pseudo' &&
          [
            'first-child',
            'last-child',
            'only-child',
            'first-of-type',
            'last-of-type',
            'only-of-type',
            'nth-child',
            'nth-last-child',
            'nth-of-type',
            'nth-last-of-type',
            'not',
            'has',
            'contains',
            'icontains',
            'empty',
            'scope',
          ].includes(token.name)
        ) {
          if (Array.isArray(token.data)) inspect(token.data);
          continue;
        }
        if (token.type === 'attribute' && token.namespace === null) continue;
        if (!['tag', 'universal', 'attribute', 'child', 'descendant'].includes(token.type)) {
          throw invalidSelector(`${token.type} requires structural syntax or is unsupported`);
        }
      }
  };
  inspect(groups);
  return groups;
};
export const validateLocator = (selector: string): void => {
  readLocator(selector);
  // Tokenization does not validate pseudo arguments. Use the pinned native engine
  // on a private constant tree before any source scope can suppress a query.
  try {
    syntaxDocument.root().find(selector);
  } catch (error) {
    throw invalidSelector(
      error instanceof Error ? error.message : 'Unsupported selector semantics',
    );
  }
};

/** Ancestor matching uses absolute selectors; descendant queries may be relative. */
export const compileClosestLocator = (
  selector: string,
  record?: Element,
): ((node: AnyNode) => boolean) => {
  const groups = readLocator(selector);
  try {
    return compile<AnyNode, Element>(groups, {
      relativeSelector: false,
      ...(record === undefined ? {} : { context: [record] }),
    });
  } catch (error) {
    throw invalidSelector(
      error instanceof Error ? error.message : 'Unsupported ancestor selector semantics',
    );
  }
};
