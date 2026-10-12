// Atrium wires no generation hooks, so every request replays a seeded
// fingerprint and `entities` filters discovery alone.
export type VexResource = {
  entities: string[];
  description: string;
};

export const RESOURCES: Record<string, VexResource> = {
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
