// The tenant boundary, enforced by the engine — the curl hole, closed.
//
// Earlier a guest's token, POSTed to the raw vex surface with a forged
// propertyId, returned another hotel's guest. This proves that no longer works:
// the scope `match` behaviour ANDs the caller's real property onto every read,
// server-side, unreferenceable by the request. It hits the SAME surface a
// browser or a curl hits.
//
// Run: pnpm --filter atrium exec tsx src/dev/scope-check.ts
import { asPrincipal, check, report } from './world';

type Row = Record<string, unknown>;
const rows = (r: unknown): Row[] => (Array.isArray(r) ? (r as Row[]) : []);

const main = async (): Promise<void> => {
  // Amara is a guest at The Lumen (prop_lumen). Rosa is the desk there. Inés is
  // a guest at Casa Marisol (prop_marisol).

  // ── the hole, closed ──
  const own = rows(await asPrincipal('amara', '/api/stay/vex', { fingerprint: 'stays/movements', context: { propertyId: 'prop_lumen', q: '%' } }));
  check(`Amara reads her own hotel's movements (${own.length} stays)`, own.length > 0 && own.every((s) => String(s['stay_id']).startsWith('stay_')));

  const forged = rows(await asPrincipal('amara', '/api/stay/vex', { fingerprint: 'stays/movements', context: { propertyId: 'prop_marisol', q: '%' } }));
  check('...but forging propertyId=prop_marisol returns NOTHING', forged.length === 0);

  // Prove it is the SCOPE doing it, not a broken query: the desk at the other
  // hotel really can read those same rows.
  const marisol = rows(await asPrincipal('ines', '/api/stay/vex', { fingerprint: 'stays/movements', context: { propertyId: 'prop_marisol', q: '%' } }));
  check('the Casa Marisol guest CAN see Casa Marisol stays', marisol.length > 0);
  check('...so the block is the tenant boundary, not an empty table', marisol.some((s) => s['stay_id'] === 'stay_ines'));

  // ── it holds on every scoped table, not just stays ──
  const ownFolio = rows(await asPrincipal('amara', '/api/stay/vex', { fingerprint: 'folio/forStay', context: { stayId: 'stay_amara' } }));
  check(`Amara reads her own folio (${ownFolio.length} lines)`, ownFolio.length > 0);
  const crossFolio = rows(await asPrincipal('amara', '/api/stay/vex', { fingerprint: 'folio/forStay', context: { stayId: 'stay_ines' } }));
  check("...but not another hotel's folio, even by stay id", crossFolio.length === 0);

  const crossMsg = rows(await asPrincipal('amara', '/api/stay/vex', { fingerprint: 'messages/forStay', context: { stayId: 'stay_ines' } }));
  check("...nor another hotel's message thread", crossMsg.length === 0);

  // ── the desk is single-tenant too ──
  const deskOwn = rows(await asPrincipal('rosa', '/api/stay/vex', { fingerprint: 'stays/movements', context: { propertyId: 'prop_lumen', q: '%' } }));
  check('the desk reads every stay at ITS hotel', deskOwn.length >= 2);
  const deskCross = rows(await asPrincipal('rosa', '/api/stay/vex', { fingerprint: 'stays/movements', context: { propertyId: 'prop_marisol', q: '%' } }));
  check('...and none at another', deskCross.length === 0);

  // ── the vendor is cross-tenant BY DESIGN, and must stay that way ──
  // The estate tables are deliberately unscoped; scoping them would blind the
  // one principal that has to see across hotels.
  const estate = rows(await asPrincipal('atrium', '/api/deploy/vex', { fingerprint: 'properties/list', context: {} }));
  check(`the vendor still reads the whole estate (${estate.length} properties)`, estate.length === 2);

  report('the tenant boundary is engine-side');
};

void main();
