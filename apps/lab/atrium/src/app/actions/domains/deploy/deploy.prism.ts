import { connectorsList, connectorOffer, connectorProperties, propertiesList, connectorSetCapability } from '@atrium/app/vex/deploy.entries';
import { surfaceGuestMatrix } from '@atrium/app/vex/surface.entries';

export const connectorsPrism = { fingerprint: connectorsList.fingerprint, context: {} };
export const propertiesPrism = { fingerprint: propertiesList.fingerprint, context: {} };

// The selected connector's OFFER — the checklist the console renders.
export const offerPrism = { fingerprint: connectorOffer.fingerprint, context: { connectorId: { $ref: '$.selected.connector_id' } } };

// Where a go-live lands.
export const reachPrism = { fingerprint: connectorProperties.fingerprint, context: { connectorId: { $ref: '$.selected.connector_id' } } };

// THE deployment write: one switch. Two seams, one per direction — the layout
// branches on the row's current state, so nothing anywhere computes a negation.
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
