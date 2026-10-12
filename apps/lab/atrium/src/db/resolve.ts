const lit = (v: string): string => `'${v.replace(/'/g, "''")}'`;

// One statement per array entry: a pooled `query` takes one.
export const resolveStatements = (connectorId?: string): string[] => {
  const scope = connectorId === undefined ? '' : `AND p.id IN (SELECT property_id FROM property_connectors WHERE connector_id = ${lit(connectorId)})`;
  const inScope = connectorId === undefined ? '' : `AND property_id IN (SELECT property_id FROM property_connectors WHERE connector_id = ${lit(connectorId)})`;

  return [
    /* sql */ `DELETE FROM live_capabilities WHERE true ${inScope}`,

    /* sql */ `
      INSERT INTO live_capabilities (id, property_id, capability_id, version, resolved_at)
      SELECT p.id || ':' || c.id, p.id, c.id, 1, now()
      FROM properties p
      CROSS JOIN capabilities c
      JOIN property_capabilities pc ON pc.property_id = p.id
                                   AND pc.capability_id = c.id
                                   AND pc.enabled = true
      WHERE c.core = true ${scope}`,

    // ON CONFLICT: a connector may also offer a core capability, and the statement
    // above has already inserted that row.
    /* sql */ `
      INSERT INTO live_capabilities (id, property_id, capability_id, version, resolved_at)
      SELECT p.id || ':' || cc.capability_id, p.id, cc.capability_id, MAX(cc.version), now()
      FROM properties p
      JOIN property_connectors pcx   ON pcx.property_id = p.id
      JOIN connectors c              ON c.id = pcx.connector_id
      JOIN connector_capabilities cc ON cc.connector_id = c.id AND cc.enabled = true
      JOIN property_capabilities pc  ON pc.property_id = p.id
                                    AND pc.capability_id = cc.capability_id
                                    AND pc.enabled = true
      WHERE true ${scope}
      GROUP BY p.id, cc.capability_id
      ON CONFLICT (id) DO NOTHING`,

    /* sql */ `DELETE FROM property_slots WHERE true ${inScope}`,

    // A live capability is not enough, the property must run the connector that shipped
    // the slot: two connectors can implement one capability, each calling its own service.
    /* sql */ `
      INSERT INTO property_slots (id, property_id, slot_id, live, reason, resolved_at)
      SELECT p.id || ':' || s.id,
             p.id,
             s.id,
             (s.enabled
              AND (s.source = 'core'
                   OR EXISTS (SELECT 1 FROM property_connectors pcx
                              WHERE pcx.property_id = p.id AND pcx.connector_id = s.source))
              AND (s.capability_id IS NULL
                   OR EXISTS (SELECT 1 FROM live_capabilities l
                              WHERE l.property_id = p.id AND l.capability_id = s.capability_id))),
             CASE
               WHEN NOT s.enabled THEN 'disabled'
               WHEN s.source <> 'core'
                    AND NOT EXISTS (SELECT 1 FROM property_connectors pcx
                                    WHERE pcx.property_id = p.id AND pcx.connector_id = s.source) THEN 'source'
               WHEN s.capability_id IS NULL THEN 'live'
               WHEN EXISTS (SELECT 1 FROM live_capabilities l
                            WHERE l.property_id = p.id AND l.capability_id = s.capability_id) THEN 'live'
               -- A capability WE implement can only be dark for one reason:
               -- the hotel switched it off. Saying 'connector' here would
               -- blame a vendor for a decision no vendor was party to.
               WHEN EXISTS (SELECT 1 FROM capabilities c2
                            WHERE c2.id = s.capability_id AND c2.core = true) THEN 'property'
               WHEN NOT EXISTS (SELECT 1 FROM property_connectors pcx
                                JOIN connectors c ON c.id = pcx.connector_id
                                JOIN connector_capabilities cc ON cc.connector_id = c.id AND cc.enabled = true
                                WHERE pcx.property_id = p.id AND cc.capability_id = s.capability_id) THEN 'connector'
               ELSE 'property'
             END,
             now()
      FROM properties p
      CROSS JOIN surface_slots s
      WHERE true ${scope}`,

    /* sql */ `UPDATE properties p SET synced_at = now() WHERE true ${scope}`,
  ];
};

export const resolveSql = (connectorId?: string): string => `${resolveStatements(connectorId).join(';\n')};\n`;
