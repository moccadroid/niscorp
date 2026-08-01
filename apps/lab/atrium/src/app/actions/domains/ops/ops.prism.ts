import { issuesByKind, issuesByRoom, roomsForProperty, roomSetStatus } from '@atrium/app/vex/service.entries';
import { propertyIntegrations, propertyServices } from '@atrium/app/vex/integrations.entries';
import { propertyCapabilitySet } from '@atrium/app/vex/deploy.entries';

const atProperty = (fingerprint: string) => ({ fingerprint, context: { propertyId: { $ref: '$.propertyId' } } });

export const byKindPrism = atProperty(issuesByKind.fingerprint);
export const byRoomPrism = atProperty(issuesByRoom.fingerprint);
// The manager sees the whole estate, so the set is every status there is.
export const roomsPrism = {
  fingerprint: roomsForProperty.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, statuses: ['clean', 'dirty', 'inspected', 'out_of_order'] },
};

// The Integrations pane: the house's connectors, then one connector's services
// crossed with the property's own switches.
export const integrationsPrism = atProperty(propertyIntegrations.fingerprint);
export const servicesPrism = {
  fingerprint: propertyServices.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, connectorId: { $ref: '$.selected.connector_id' } },
};

// The one write on that pane — the property's switch, one seam per direction
// so nothing computes a negation. The row id came from the read above, so
// nothing here names a property or a capability by hand.
export const offerOnPrism = { fingerprint: propertyCapabilitySet.fingerprint, context: { rowId: { $ref: '$.stage.row_id' }, enabled: true } };
export const offerOffPrism = { fingerprint: propertyCapabilitySet.fingerprint, context: { rowId: { $ref: '$.stage.row_id' }, enabled: false } };

// Taking a room out of, or back into, service. There is one room-state write and
// this is the manager's use of it: `status` is the value the tapped row already
// worked out, so nothing here negates anything.
export const setRoomPrism = {
  fingerprint: roomSetStatus.fingerprint,
  context: { roomId: { $ref: '$.toggleRoomId' }, status: { $ref: '$.toggleStatus' } },
};
