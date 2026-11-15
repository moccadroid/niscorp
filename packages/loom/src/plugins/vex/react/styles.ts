import type { CSSProperties } from 'react';
import { COLORS } from '@react/kit/tokens.js';

export const fieldStyle: CSSProperties = { padding: '6px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
export const controlBtn: CSSProperties = { padding: '6px 10px', border: `1px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.fill, cursor: 'pointer', fontSize: 13 };
