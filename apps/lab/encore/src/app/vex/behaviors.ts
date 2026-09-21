import type { ScopeBehaviors } from '@niscorp/vex';

// Row behaviors. Encore is one festival and one tenant, so there is no `match`
// on the festival's own tables — nothing to fence one site's rows from
// another's. What there IS, is
// identity: the two ledger tables record who pressed the button, and that
// column is written by the engine from the session, on every insert, whatever
// the request body says. Neither form carries a `created_by` field and neither
// mutation entry names the column — there is nothing for a client to forge.
export const scopeBehaviors: ScopeBehaviors = {
  delays: { write: [{ set: 'created_by', to: 'userId' }] },
  pushes: { write: [{ set: 'created_by', to: 'userId' }] },
  // THE THREAD IS ONE PERSON'S. The only `match` in the app: a turn is stamped
  // with whoever was at the line when it was written, and read back only by
  // them — so the text model's memory of one operator can never be handed to
  // another, whatever a request says.
  // A LABEL IS ONE PERSON'S CLICK: stamped with who clicked, read back only by
  // them. The calibration record is per operator by construction.
  attention_labels: {
    read: [{ match: 'principal', to: 'userId' }],
    write: [{ set: 'principal', to: 'userId' }],
  },
  agent_turns: {
    read: [{ match: 'principal', to: 'userId' }],
    write: [{ set: 'principal', to: 'userId' }],
  },
};
