// The look: a theme's tokens, and the layout it wears per action.
export const THEMES_DDL = /* sql */ `
  CREATE TABLE themes (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    tokens      JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  CREATE TABLE theme_layouts (
    id          TEXT PRIMARY KEY,
    theme_id    TEXT NOT NULL REFERENCES themes(id),
    action_id   TEXT NOT NULL,
    layout      JSONB NOT NULL,
    UNIQUE (theme_id, action_id)
  );
`;
