/**
 * XLSX Parsing Utilities
 *
 * This module provides utilities for reading and parsing XLSX files,
 * including helpers to extract hyperlinks and detect URLs.
 */

import { looksLikeUrl } from './utils.js';

// Read file as ArrayBuffer
export const readAsArrayBuffer = f => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsArrayBuffer(f);
});

// Parse XLSX worksheet with improved URL/hyperlink capture
export function parseWorksheet(ws) {
    const ref = ws["!ref"]; if (!ref) return { headers: [], data: [], linkMap: {} };
    const R = XLSX.utils.decode_range(ref);
    const headers = [];
    for (let c = R.s.c; c <= R.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: R.s.r, c })];
        let v = cell ? (cell.w ?? cell.v ?? "") : "";
        headers.push(String(v).trim() || `Column ${c - R.s.c + 1}`);
    }
    const data = [], linkMap = {};
    for (let r = R.s.r + 1; r <= R.e.r; r++) {
        const row = {}; let rowLinks = null;
        for (let c = R.s.c; c <= R.e.c; c++) {
            const h = headers[c - R.s.c];
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            let display = "";
            if (cell) {
                display = String(cell.w ?? cell.v ?? "");
                // prefer explicit hyperlink object if present
                if (cell.l && cell.l.Target) {
                    rowLinks = rowLinks || {};
                    rowLinks[h] = cell.l.Target;
                } else {
                    // fallback: if the cell text/value looks like a URL, capture it as a link
                    const rawVal = String(cell.v ?? cell.w ?? "").trim();
                    if (looksLikeUrl(rawVal)) {
                        rowLinks = rowLinks || {};
                        rowLinks[h] = rawVal;
                    }
                }
            }
            row[h] = display ?? "";
        }
        const idx = data.length; data.push(row); if (rowLinks) linkMap[idx] = rowLinks;
    }
    return { headers, data, linkMap };
}
