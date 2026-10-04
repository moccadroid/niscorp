import { z } from 'zod';

// The authoring contract of a head node (./head): what a layout may set on it.
// Its props are bound and resolved like any other node's.

const HEAD_DESCRIPTION =
  'What this screen says it is: its title, description and preview picture. Draws nothing. One per screen, holding everything it says: where several are on a screen the last one is used whole, and they are never merged.';

export const HeadPropsSchema = z
  .object({
    title: z.string().optional().describe('The name of what this screen shows. Written as given: it becomes the document title and the title of its preview.'),
    description: z.string().optional().describe('One or two sentences saying what this screen shows, as plain text.'),
    image: z
      .string()
      .optional()
      .describe(
        'Address of a picture that stands for this screen where a link to it is previewed: an absolute URL, or a path. A path is made absolute against the page’s own address when the site’s address is known, and written as given when it is not.',
      ),
    kind: z
      .enum(['website', 'article'])
      .optional()
      .describe('What sort of thing this screen is. `article`: a piece of writing that stands on its own. `website`: anything else. Left out, nothing is written and the document keeps what it already says.'),
    structured: z
      .union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown()))])
      .optional()
      .describe('Structured data about what this screen shows: a JSON-LD object, or a list of them. Written as given, so each object carries its own `@context` and `@type`.'),
  })
  .strict()
  .describe(HEAD_DESCRIPTION);

export type HeadProps = z.infer<typeof HeadPropsSchema>;

// What to register the name with, for a palette that should offer it.
export const HEAD_META = {
  description: HEAD_DESCRIPTION,
  propsSchema: HeadPropsSchema,
};
