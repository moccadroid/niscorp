// Which integrations a studio has bought.
export const INTEGRATIONS_DDL = /* sql */ `
  CREATE TABLE studio_integrations (
    studio_id       TEXT NOT NULL REFERENCES studios(id),
    integration_id  TEXT NOT NULL,
    enabled         BOOLEAN NOT NULL DEFAULT true,
    installed_on    DATE NOT NULL DEFAULT CURRENT_DATE,
    PRIMARY KEY (studio_id, integration_id)
  );
`;
