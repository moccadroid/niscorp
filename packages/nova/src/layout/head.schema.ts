import { z } from 'zod';
import { HEAD_LINK_NAME, HEAD_META_NAME, HEAD_NAME, HEAD_SCRIPT_NAME, HEAD_TITLE_NAME } from './head';
import type { ComponentMeta } from './types';

// The authoring contracts of a head and the elements it holds (./head): what a
// layout may set on each. Props are bound and resolved like any other node's.
//
// An element's props are its attributes, so these are open records: any
// attribute HTML gives the element may be written. What each refuses is said
// in its description, and held by the reader (`headOf`), not by a list here.

// What every element refuses, whatever else it is.
const REFUSED_ATTRIBUTES = 'an attribute whose name starts with `on`, or a prop whose name is not an attribute’s name';

const AttributeSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .describe(
    'An attribute’s value. Text is written as given, a number as text. `true` writes the attribute with no value. `false`, an empty or blank string, and anything that is none of these (a binding not answered yet, an object, a list) leave the attribute out.',
  );

export const HeadPropsSchema = z
  .object({})
  .strict()
  .describe(
    'The document’s <head>. Takes no props. Its children are the elements the head holds — `nova:title`, `nova:meta`, `nova:link`, `nova:script` — placed directly or through loops and conditions; any other component among them is refused and left out, and the rest stand. Draws nothing on the screen. Elements are read in the order written, and where a screen holds several heads, in the order the screen is drawn. A later element takes an earlier one’s place when both are the title, both are a `nova:meta` of the same `name` or `property`, or both are a `nova:link` whose `rel` includes `canonical`. Any other two stand side by side.',
  );

export const HeadTitlePropsSchema = z
  .object({})
  .strict()
  .describe(
    'The document’s <title>, inside `nova:head`. Takes no props. Its text is given as its children: a text string, which may hold bindings — not components. A title with no text is left out.',
  );

export const HeadMetaPropsSchema = z
  .record(z.string(), AttributeSchema)
  .describe(
    `A <meta> element, inside \`nova:head\`. Its props are the element’s attributes, written as given: \`name\` or \`property\` to say what it is, \`content\` for its value. Left out while it has no \`content\`. A later one with the same \`name\` or \`property\` takes an earlier one’s place (compared without regard to case; \`name\` decides when both are set), and one with neither stands beside the rest. The whole element is refused and left out if it has \`http-equiv\`, which instructs the browser rather than describing the document, ${REFUSED_ATTRIBUTES}.`,
  );

export const HeadLinkPropsSchema = z
  .record(z.string(), AttributeSchema)
  .describe(
    `A <link> element, inside \`nova:head\`. Its props are the element’s attributes, written as given: \`rel\` to say what the link is, \`href\` for its address, and any other the element takes (\`type\`, \`hreflang\`, \`sizes\`, \`media\`). Left out while it has no \`href\`. A later one whose \`rel\` includes \`canonical\` takes an earlier canonical’s place; all other links stand side by side. The whole element is refused and left out if its \`rel\` includes \`stylesheet\`, which styles the page, or it has ${REFUSED_ATTRIBUTES}.`,
  );

export const HeadScriptPropsSchema = z
  .object({
    type: z
      .string()
      .describe('The kind of data the block holds. Only a JSON type is accepted: `application/json`, or one ending in `+json` such as `application/ld+json`. Any other type, or none, is refused.'),
    data: z
      .unknown()
      .describe('What the block holds: the value itself — an object, a list, a number, text — which is serialised as JSON. Not JSON already written as text. Nothing, `null` or an empty string counts as no data.'),
  })
  .catchall(AttributeSchema)
  .describe(
    `A <script> element that holds data, inside \`nova:head\`: \`type\`, \`data\`, and any other attribute the element takes. Left out while it has no \`data\`. Data blocks never take one another’s place. It never runs: the whole element is refused and left out unless its \`type\` is a JSON type, and if it has a \`src\` or ${REFUSED_ATTRIBUTES}.`,
  );

export type HeadMetaProps = z.infer<typeof HeadMetaPropsSchema>;
export type HeadLinkProps = z.infer<typeof HeadLinkPropsSchema>;
export type HeadScriptProps = z.infer<typeof HeadScriptPropsSchema>;

const described = (schema: z.ZodTypeAny): ComponentMeta => ({ description: schema.description ?? '', propsSchema: schema });

// What to register each name with, for a palette that should offer them.
export const HEAD_META: Record<string, ComponentMeta> = {
  [HEAD_NAME]: described(HeadPropsSchema),
  [HEAD_TITLE_NAME]: described(HeadTitlePropsSchema),
  [HEAD_META_NAME]: described(HeadMetaPropsSchema),
  [HEAD_LINK_NAME]: described(HeadLinkPropsSchema),
  [HEAD_SCRIPT_NAME]: described(HeadScriptPropsSchema),
};
