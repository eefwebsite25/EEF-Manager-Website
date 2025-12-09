/**
 * Utility Functions
 *
 * This module provides DOM helpers, CSV utilities, download helpers,
 * toast notifications, SharePoint link canonicalization, URL detection,
 * and name/date formatting helpers.
 */

// === Tiny DOM helpers ===
export const $ = id => document.getElementById(id);
export const setText = (id, v) => $(id).textContent = v;
export const showEl = (id, on = true) => $(id).classList.toggle('hidden', !on);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
export const attr = s => String(s ?? "").replace(/["\n\r]/g, " ");

export const fmtMoney = v => {
    if (v == null || v === "") return "";
    const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
    return isNaN(n) ? String(v) : "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};

// Helper: return first name (lowercased) from a name string
export function firstName(s) {
    if (!s) return "";
    return String(s || "").trim().split(/\s+/)[0].toLowerCase();
}

// Helper: format a Date (local) to yyyy-mm-dd (avoids UTC shift)
export function toLocalYMDFromDate(d) {
    if (!d || isNaN(d)) return "";
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Helper: accept raw (string/Date) and produce local yyyy-mm-dd, or "" if invalid
export function toLocalYMD(raw) {
    if (!raw) return "";
    // If already looks like yyyy-mm-dd (HTML date input format), return that.
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw).trim())) return String(raw).trim();
    const d = new Date(raw);
    if (!isNaN(d)) return toLocalYMDFromDate(d);
    return "";
}

// === CSV helper ===
export const CSV = {
    stringify(headers, rows) {
        const e = v => {
            const s = String(v ?? "");
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        return [headers.map(e).join(','), ...rows.map(r => headers.map(k => e(r[k])).join(','))].join('\n');
    }
};

// === Download helper ===
export const download = (content, name, type = "text/plain") => {
    const b = new Blob([content], { type });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(u);
};

// === Global toast notifications (top-right, fade-only, 1.5s) ===
export function notify(message, type = "info", durationMs = 1500) {
    const box = $("toasts");
    const t = document.createElement("div");
    t.className = `toast toast-${type}`;
    t.textContent = message;
    box.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
        t.classList.remove("show");
        setTimeout(() => t.remove(), 250);
    }, durationMs);
}

// === SharePoint link canonicalizer ===
export function canonicalizeSharePointLink(raw) {
    if (!raw) return raw;
    try {
        let url = String(raw).trim();
        url = url.replace(/&amp%3B/g, "&").replace(/&amp;/g, "&");
        const tenant = "o365coloradoedu.sharepoint.com";
        const sitePrefix = "https://" + tenant;

        // If it's a relative SharePoint path like "/sites/..." or "/teams/..."
        if (/^\/(sites|teams)\//i.test(url)) {
            return `${sitePrefix}${url}${url.includes('?') ? '&' : '?'}web=1`;
        }

        // Some SharePoint links are embedded/encoded (contain "/:")
        if (/\/:/.test(url)) {
            const pathMatch = decodeURIComponent(url).match(/\/sites\/[^?]+/);
            if (pathMatch) {
                const clean = pathMatch[0].replace(/\/r\//, "/").replace(/\/:b:\//, "/");
                return `${sitePrefix}${clean}`;
            }
        }

        // Ensure URL has a protocol for parsing (if it didn't match the relative case above)
        if (!/^https?:\/\//i.test(url)) url = "https://" + url;

        const parsed = new URL(url);
        const id = parsed.searchParams.get("id") || parsed.searchParams.get("Id");
        if (id) {
            const decoded = decodeURIComponent(id);
            return `${sitePrefix}${decoded}?web=1`;
        }

        if (parsed.hostname.includes("sharepoint.com")) {
            parsed.hostname = tenant;
            if (!parsed.searchParams.has("web")) parsed.searchParams.set("web", "1");
            return parsed.toString();
        }

        return parsed.toString();
    } catch (err) {
        console.warn("SharePoint link canonicalization failed:", err);
        return raw;
    }
}

// Helper to detect various URL-like values (full urls, sharepoint paths, drive links, etc.)
export function looksLikeUrl(s) {
    if (!s) return false;
    const t = String(s).trim();
    // common URL forms: protocol, www., direct sharepoint paths, or domains we care about
    return /^(https?:\/\/|www\.|\/(sites|teams)\/)/i.test(t)
        || /sharepoint\.com/i.test(t)
        || /drive\.google\.com|onedrive\.live\.com|dropbox\.com/i.test(t);
}

/**
 * Determine whether a value looks like a filename/attachment (pdf/doc/zip etc)
 */
export function looksLikeFilename(v) {
    if (!v) return false;
    const s = String(v).trim();
    // ends with common extensions OR contains path separators & short names with no spaces
    if (/\.(pdf|docx?|pptx?|zip|xlsx?)$/i.test(s)) return true;
    if (/^[\w-]{3,}\.(pdf|docx?)$/i.test(s)) return true;
    if (s.includes("\\") || s.includes("/")) return true;
    return false;
}
