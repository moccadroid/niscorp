import { connectorsList, connectorOffer, connectorProperties, propertiesList, connectorSetCapability } from '@atrium/app/vex/deploy.entries';
import { surfaceGuestMatrix } from '@atrium/app/vex/surface.entries';

export const connectorsPrism = { fingerprint: connectorsList.fingerprint, context: {} };
export const propertiesPrism = { fingerprint: propertiesList.fingerprint, context: {} };

export const offerPrism = { fingerprint: connectorOffer.fingerprint, context: { connectorId: { $ref: '$.selected.connector_id' } } };

export const reachPrism = { fingerprint: connectorProperties.fingerprint, context: { connectorId: { $ref: '$.selected.connector_id' } } };

export const stageOnPrism = {
  fingerprint: connectorSetCapability.fingerprint,
  context: { rowId: { $ref: '$.stage.row_id' }, enabled: true },
};
export const stageOffPrism = {
  fingerprint: connectorSetCapability.fingerprint,
  context: { rowId: { $ref: '$.stage.row_id' }, enabled: false },
};

export const guestMatrixPrism = {
  fingerprint: surfaceGuestMatrix.fingerprint,
  context: { propertyId: { $ref: '$.property.property_id' } },
};
