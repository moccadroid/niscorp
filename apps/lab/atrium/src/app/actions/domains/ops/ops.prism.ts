import { issuesByKind, issuesByRoom, roomsForProperty, roomSetStatus } from '@atrium/app/vex/service.entries';
import { propertyIntegrations, propertyServices } from '@atrium/app/vex/integrations.entries';
import { propertyCapabilitySet } from '@atrium/app/vex/deploy.entries';

const atProperty = (fingerprint: string) => ({ fingerprint, context: { propertyId: { $ref: '$.propertyId' } } });

export const byKindPrism = atProperty(issuesByKind.fingerprint);
export const byRoomPrism = atProperty(issuesByRoom.fingerprint);
export const roomsPrism = {
  fingerprint: roomsForProperty.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, statuses: ['clean', 'dirty', 'inspected', 'out_of_order'] },
};

export const integrationsPrism = atProperty(propertyIntegrations.fingerprint);
export const servicesPrism = {
  fingerprint: propertyServices.fingerprint,
  context: { propertyId: { $ref: '$.propertyId' }, connectorId: { $ref: '$.selected.connector_id' } },
};

export const offerOnPrism = { fingerprint: propertyCapabilitySet.fingerprint, context: { rowId: { $ref: '$.stage.row_id' }, enabled: true } };
export const offerOffPrism = { fingerprint: propertyCapabilitySet.fingerprint, context: { rowId: { $ref: '$.stage.row_id' }, enabled: false } };

export const setRoomPrism = {
  fingerprint: roomSetStatus.fingerprint,
  context: { roomId: { $ref: '$.toggleRoomId' }, status: { $ref: '$.toggleStatus' } },
};
