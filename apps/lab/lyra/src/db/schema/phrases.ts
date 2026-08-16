// The words: what this application says, in a language.
export const PHRASES_DDL = /* sql */ `
  -- WHAT THIS APPLICATION SAYS, IN A LANGUAGE. The exact twin of "themes"
  -- above, and for the same reason: a studio's look and a studio's language
  -- are both things a person should be able to change without a release.
  --
  -- Keyed on the SOURCE PHRASE, not on an invented id. The English in the
  -- layouts stays the readable thing it is, and this table says what it reads
  -- as elsewhere. The cost of that choice is real and lives here: one English
  -- word with two senses ("Book" the verb, "Book" the noun) is one row and
  -- needs two German words. "context" is the escape — a disambiguated variant
  -- that a future $t directive names explicitly. Nothing sets it yet.
  --
  -- Rows, not a JSON file, because the same argument as the theme applies:
  -- a studio that calls its members "athletes" is one UPDATE, and the words
  -- an application uses are exactly the kind of thing whose owner is not the
  -- person who can deploy.
  CREATE TABLE phrases (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    -- A LANGUAGE, never a region: what a row holds is words, and Vienna and
    -- Hamburg read the same ones. The column is the same shape as the one on
    -- "studios", so a studio's tag selects a book by equality and no caller
    -- has to know how to widen a tag into a language first.
    locale      TEXT NOT NULL CHECK (locale ~ '^[a-z]{2}$'),
    source      TEXT NOT NULL,
    text        TEXT NOT NULL,
    -- Reserved: which SENSE of the source this is. NULL is "the only sense".
    context     TEXT,
    UNIQUE (locale, source, context)
  );

  CREATE INDEX phrases_by_locale ON phrases (locale);
`;
