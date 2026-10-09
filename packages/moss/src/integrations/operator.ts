import { z } from 'zod';

// ── what a route is sent ─────────────────────────────────────
//
// A body is whatever the caller wrote. Each route reads the fields it has a
// use for; a body that is not an object, or a field that is not text, reads as
// that field left out.
export const RegisterBodySchema = z.looseObject({ id: z.string().catch(''), url: z.string().catch('') }).catch({ id: '', url: '' });
export const PathBodySchema = z.looseObject({ path: z.string().optional().catch(undefined) }).catch({});
