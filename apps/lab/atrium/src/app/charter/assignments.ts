// Principal ids are the row ids they correspond to: `gst_amara` is a guests
// row, `stf_rosa` a staff row. Henrik manages both houses as two principals,
// one per property, because a principal is single-tenant.
export const ASSIGNMENTS: Record<string, readonly string[]> = {
  gst_amara: ['guest'],
  gst_theo: ['guest'],
  gst_ines: ['guest'],
  stf_rosa: ['desk'],
  stf_pilar: ['desk'],
  stf_kwame: ['service'],
  stf_henrik: ['ops'],
  stf_henrik_m: ['ops'],
  usr_vendor: ['vendor'],
};
