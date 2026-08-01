// Vex resources — the scoped query surfaces, mounted under /api/<name>/vex.
//
// A resource is an entity plus the subgraph it may be discovered and queried
// with. Atrium wires no generation hooks, so every request cache-hits a seeded
// fingerprint and these filters bite on discovery alone — but they are still the
// honest statement of which tables belong together, and they are what a future
// agent path would be held to.

export type VexResource = {
  entities: string[];
  description: string;
};

export const RESOURCES: Record<string, VexResource> = {
  // The resolved surface: what exists for whom. Deliberately narrow — this is
  // the most sensitive read in the app, because it describes the application.
  surface: {
    entities: ['property_slots', 'surface_slots', 'capabilities', 'properties'],
    description: 'The resolved surface at a property: which shipped slots are live, and why the dark ones are dark.',
  },
  stay: {
    entities: ['stays', 'guests', 'rooms', 'properties', 'connectors', 'property_connectors', 'request_options', 'folio_lines', 'messages'],
    description: 'A stay mirrored from a PMS, with its guest, room, property, request catalogue, folio and message thread.',
  },
  service: {
    entities: ['issues', 'tasks', 'rooms', 'stays', 'staff', 'properties'],
    description: 'Issues raised against rooms and stays, and the tasks dispatched for them.',
  },
  // The integrator's own console. Connectors and versions are shipped catalog,
  // identical for every tenant; only the vendor is granted the writes.
  deploy: {
    entities: ['connectors', 'connector_capabilities', 'capabilities', 'properties', 'property_connectors', 'property_capabilities'],
    description: 'Connectors of every kind, what each version implements, and which properties run them.',
  },
};

export const resourceEntities = (path: string): string[] | undefined => {
  const match = /\/api\/([a-z_]+)\/vex$/.exec(path);
  const resource = match?.[1];
  return resource !== undefined ? RESOURCES[resource]?.entities : undefined;
};
