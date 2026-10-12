import { sql, check, report } from './world';

const main = async (): Promise<void> => {
  const lumen = await sql(
    `SELECT s.id, ps.live, ps.reason FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id
     WHERE ps.property_id = 'prop_lumen' AND s.audience = 'guest' ORDER BY s.position`,
  );
  const marisol = await sql(
    `SELECT s.id, ps.live, ps.reason FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id
     WHERE ps.property_id = 'prop_marisol' AND s.audience = 'guest' ORDER BY s.position`,
  );

  const at = (rows: Record<string, unknown>[], id: string) => rows.find((r) => r['id'] === id);
  const live = (rows: Record<string, unknown>[], id: string): boolean => at(rows, id)?.['live'] === true;
  const why = (rows: Record<string, unknown>[], id: string): string => String(at(rows, id)?.['reason'] ?? '');

  check(`both properties resolved the whole guest catalogue (${lumen.length} slots each)`, lumen.length === marisol.length && lumen.length >= 9);

  check('The Lumen has no mobile key', !live(lumen, 'gs_key'));
  check('...because the connector has it switched off', why(lumen, 'gs_key') === 'connector');
  check('The Lumen has no express checkout', !live(lumen, 'gs_checkout'));
  check('The Lumen does have online check-in', live(lumen, 'gs_checkin'));
  check('The Lumen has wake-up calls (bundle)', live(lumen, 'gs_wake'));
  check('The Lumen has late checkout (bundle)', live(lumen, 'gs_late'));
  check('The Lumen has upgrades (bundle)', live(lumen, 'gs_upgrades'));
  check('The Lumen has no minibar card — Mews ships that', !live(lumen, 'gs_minibar') && why(lumen, 'gs_minibar') === 'source');

  check('Casa Marisol has the spa (bundle)', live(marisol, 'gs_spa'));
  check('Casa Marisol has the minibar (bundle)', live(marisol, 'gs_minibar'));
  check('Casa Marisol has housekeeping requests', live(marisol, 'gs_housekeeping'));
  check('Casa Marisol has no wake-up calls — Opera ships those', !live(marisol, 'gs_wake') && why(marisol, 'gs_wake') === 'source');

  const deskAt = async (propertyId: string): Promise<Record<string, unknown>[]> =>
    sql(
      `SELECT s.id, ps.live, ps.reason FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id
       WHERE ps.property_id = $1 AND s.capability_id = 'folio.adjust' ORDER BY s.id`,
      [propertyId],
    );
  const lumenDesk = await deskAt('prop_lumen');
  const marisolDesk = await deskAt('prop_marisol');
  check("The Lumen resolves Opera's bill surface", live(lumenDesk, 'ds_opera_folio'));
  check("...and not Mews's, though the capability is live here", !live(lumenDesk, 'ds_mews_folio') && why(lumenDesk, 'ds_mews_folio') === 'source');
  check("Casa Marisol resolves Mews's, and only Mews's", live(marisolDesk, 'ds_mews_folio') && !live(marisolDesk, 'ds_opera_folio'));
  check('Casa Marisol has no mobile key at any version', !live(marisol, 'gs_key') && why(marisol, 'gs_key') === 'connector');
  check('Casa Marisol has no online check-in', !live(marisol, 'gs_checkin'));
  check('...because the PROPERTY switched it off, not the integration', why(marisol, 'gs_checkin') === 'property');

  const liveAt = (rows: Record<string, unknown>[]): string[] => rows.filter((r) => r['live'] === true).map((r) => String(r['id'])).sort();
  const a = liveAt(lumen).join(',');
  const b = liveAt(marisol).join(',');
  check(`the two guest surfaces are not the same set (${liveAt(lumen).length} vs ${liveAt(marisol).length})`, a !== b);

  const unconditional = await sql(
    `SELECT ps.live FROM property_slots ps JOIN surface_slots s ON s.id = ps.slot_id WHERE s.capability_id IS NULL`,
  );
  check('slots with no capability requirement are live everywhere', unconditional.length > 0 && unconditional.every((r) => r['live'] === true));

  const coreLive = await sql(
    `SELECT c.id, l.property_id
     FROM capabilities c
     LEFT JOIN live_capabilities l ON l.capability_id = c.id
     WHERE c.core = true`,
  );
  const coreIds = [...new Set(coreLive.map((r) => String(r['id'])))];
  check(`the capabilities we implement ourselves are marked as ours (${coreIds.length})`, coreIds.length >= 6 && coreIds.includes('stay.view') && coreIds.includes('issue.manage'));
  for (const property of ['prop_lumen', 'prop_marisol']) {
    const here = coreLive.filter((r) => r['property_id'] === property).map((r) => String(r['id']));
    check(`...and every one of them is live at ${property} with no connector asked`, coreIds.every((id) => here.includes(id)));
  }

  const vendorOnly = await sql(`SELECT id FROM capabilities WHERE core = false`);
  const vendorIds = vendorOnly.map((r) => String(r['id']));
  check('a door credential is NOT ours to claim', vendorIds.includes('key.issue'));
  check('...nor a spa diary, nor express checkout, nor a car', ['spa.book', 'checkout.express', 'transfer.book'].every((id) => vendorIds.includes(id)));

  const coreOff = await sql(
    `SELECT ps.reason FROM property_slots ps
     JOIN surface_slots s ON s.id = ps.slot_id
     JOIN capabilities c ON c.id = s.capability_id
     WHERE c.core = true AND ps.live = false`,
  );
  check('a core capability that is dark blames the hotel, never a vendor', coreOff.every((r) => r['reason'] === 'property' || r['reason'] === 'disabled'));

  report('the resolved surface');
};

void main();
