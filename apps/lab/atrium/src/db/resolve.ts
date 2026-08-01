// The connector sync — the ONE place the resolved layer is written.
//
// Everything a shell reads about what exists comes out of `live_capabilities`
// and `property_slots`, and neither is ever authored by hand. This recomputes
// both from the three inputs that actually decide:
//
//   1. which capabilities the connector has ENABLED (its offer)
//   2. what the property has ENABLED (its pick from the offer)
//   3. which capability each shipped slot REQUIRES
//
// Which is why "ship a capability" is flipping its enabled row plus these four
// statements, and not a deploy. The vendor console runs them; the seed runs them
// once at boot so a fresh database starts coherent.
//
// It lives in db/ because it is environment work — folding an external system's
// capability matrix into our projection — not application logic. Nothing under
// app/ knows it exists; the app only ever reads the rows it leaves behind.

const lit = (v: string): string => `'${v.replace(/'/g, "''")}'`;

// One statement per array entry, because a pooled `query` takes one. Scoped to
// the properties bound to one connector when given an id — shipping Opera does
// not touch the hotels on Mews, but it DOES touch every property that runs Opera.
export const resolveStatements = (connectorId?: string): string[] => {
  const scope = connectorId === undefined ? '' : `AND p.id IN (SELECT property_id FROM property_connectors WHERE connector_id = ${lit(connectorId)})`;
  const inScope = connectorId === undefined ? '' : `AND property_id IN (SELECT property_id FROM property_connectors WHERE connector_id = ${lit(connectorId)})`;

  return [
    /* sql */ `DELETE FROM live_capabilities WHERE true ${inScope}`,

    // ─── the floor: what WE implement ──────────────────────
    // A core capability needs no connector and no pull. It is live wherever the
    // property has it switched on, which means the app's own product — the
    // board, the inbox, the movements list, room status — survives an
    // integrations service that is down, restarting, or has never been
    // deployed. It is the first statement on purpose: the floor exists before
    // anybody asks a vendor anything.
    /* sql */ `
      INSERT INTO live_capabilities (id, property_id, capability_id, version, resolved_at)
      SELECT p.id || ':' || c.id, p.id, c.id, 1, now()
      FROM properties p
      CROSS JOIN capabilities c
      JOIN property_capabilities pc ON pc.property_id = p.id
                                   AND pc.capability_id = c.id
                                   AND pc.enabled = true
      WHERE c.core = true ${scope}`,

    // Live = what ANY of the property's connectors currently offers (enabled
    // rows), INTERSECT what the property turned on. GROUP BY collapses a
    // capability two connectors both provide to one live row.
    //
    // ON CONFLICT because a vendor may also implement something we do — the
    // floor already claimed that row, and one live capability is one row.
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

    // The resolved surface. Every (property × slot) pair gets a row; `live` is
    // the answer and `reason` is why, decided here because the resolver is the
    // only thing that knows. A layout must never work this out.
    //
    // TWO conditions, and the second only became visible when two vendors
    // implemented the same capability:
    //
    //   1. the capability is live here (its connector offers it, the property
    //      enabled it) — reason 'connector' or 'property' when not
    //   2. the property actually RUNS the connector that shipped the slot —
    //      reason 'source'. Mews and Opera both do folio adjustment, and each
    //      ships its own surface calling its own service; without this, the
    //      Mews surface would resolve at an Opera-only hotel and its calls
    //      would go to a connector that hotel does not have. `source = 'core'`
    //      is the app's own, which every property runs by definition.
    //
    // A THIRD condition sits in front of both: `s.enabled`, our own switch.
    // It is checked first and answers 'disabled', because when we have taken a
    // surface off the estate the other two questions are not the reason it is
    // dark and reporting one of them would be a lie.
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

    // Stamp the projection. A real sync stamps per mirrored row as it pulls;
    // here the property is the unit.
    /* sql */ `UPDATE properties p SET synced_at = now() WHERE true ${scope}`,
  ];
};

// The seed runs the whole thing at once through `exec`, which takes a script.
export const resolveSql = (connectorId?: string): string => `${resolveStatements(connectorId).join(';\n')};\n`;
