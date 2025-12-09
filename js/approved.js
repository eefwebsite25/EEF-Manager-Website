/**
 * Approved Tab Functions
 *
 * This module handles the Approved tab operations including rendering,
 * exporting, remapping approved data, and editing/deleting approved records.
 */

import { $, setText, esc, attr, notify, CSV, download } from './utils.js';
import { storage } from './storage.js';
import { findProposalUrlByName, detectSpeedtypeFromRow } from './survey.js';

const REQUEST_KEYS = [
    "Requested Amount",
    "Amount Requested",
    "Total Requested",
    "Request Amount",
    "Submission Amount",
    "Budget",
    "Q7",
    "Enter the total cost requested in your proposal",
    "Amount"
];

const getRequestedAmountFromRow = (row = {}) => {
    if (!row) return "";
    // 1. exact matches
    const exact = REQUEST_KEYS.find(k => row[k] != null && row[k] !== "");
    if (exact) return row[exact];
    // 2. fuzzy match on header text
    const fuzzyKey = Object.keys(row).find(k => /request(ed)?/i.test(k));
    if (fuzzyKey && row[fuzzyKey] != null && row[fuzzyKey] !== "") return row[fuzzyKey];
    // 3. fallback: first column containing "amount" with numeric-looking value
    const amountKey = Object.keys(row).find(k => /amount|budget/i.test(k) && row[k] != null && row[k] !== "");
    if (amountKey) return row[amountKey];
    return "";
};

// Render Approved tab
export function renderApproved(app, openDetail) {
    const tab = app.activeTab;
    if (!tab) {
        setText("ap-meta", `0 rows • 0 columns`);
        if ($("ap-head")) $("ap-head").innerHTML = "";
        if ($("ap-body")) $("ap-body").innerHTML = "";
        return;
    }

    // Build toggle UI for selecting mapped columns
    const container = $("ap-extra-container");
    if (container) {
        container.innerHTML = tab.headers.map(h => {
            const active = app.approvedSelectedExtras && app.approvedSelectedExtras.has(h) ? "active" : "";
            return `<div class="toggle-btn ${active}" data-header="${attr(h)}">${esc(h)}</div>`;
        }).join("");
        container.querySelectorAll(".toggle-btn").forEach(btn => {
            btn.onclick = () => {
                const hdr = btn.dataset.header;
                app.approvedSelectedExtras = app.approvedSelectedExtras || new Set();
                if (app.approvedSelectedExtras.has(hdr)) {
                    app.approvedSelectedExtras.delete(hdr);
                    btn.classList.remove("active");
                } else {
                    app.approvedSelectedExtras.add(hdr);
                    btn.classList.add("active");
                }
                renderApproved(app, openDetail); // live update
            };
        });
    }

    // collect selected mapped headers
    const selectedExtras = Array.from(app.approvedSelectedExtras || []);

    // base approved headers without Email/Speedtype (we'll insert auto columns)
    const baseHeaders = app.approved.headers.filter(h => !["Email", "Speedtype"].includes(h));
    const projectIdx = baseHeaders.indexOf("Project Name");
    const insertIndex = projectIdx === -1 ? 0 : projectIdx + 1;

    const headers = [
        ...baseHeaders.slice(0, insertIndex),
        "Email (auto)",
        "Speedtype (auto)",
        ...baseHeaders.slice(insertIndex),
        ...selectedExtras.map(h => `${h} (mapped)`),
        "Proposal Link",
        "Actions"
    ];

    setText("ap-meta", `${app.approved.data.length} rows • ${headers.length} columns`);

    // populate email / speedtype selects (used by Remap)
    if ($("ap-email")) $("ap-email").innerHTML = tab.headers.map(h => `<option>${esc(h)}</option>`).join("");
    if ($("ap-extra")) $("ap-extra").innerHTML = tab.headers.map(h => `<option>${esc(h)}</option>`).join("");

    $("ap-head").innerHTML = "<tr>" + headers.map(h => `<th><div class='th-inner'>${esc(h)}</div></th>`).join("") + "</tr>";

    const truncate = (v, max = 80) => String(v || "").length > max ? v.slice(0, max) + "…" : String(v || "");

    $("ap-body").innerHTML = app.approved.data.map(row => {
        const project = row["Project Name"] || "";
        const note = truncate(app.proposalNotes[project] || "", 80);
        const dataRow = (tab.data || []).find(r => String(r[tab.matchColumn] || "").trim() === String(project).trim()) || {};
        const requestedFromDataset = getRequestedAmountFromRow(dataRow);

        // Auto-detect email and speedtype using the centralized helper
        const joinedDataset = Object.values(dataRow).join(" ");
        const emailMatch = joinedDataset.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : (dataRow[$("ap-email")?.value] || row["Email"] || "—");

        const detected = detectSpeedtypeFromRow(dataRow, row, $("ap-extra")?.value);
        const speedtype = detected || "";
        const speedDisplay = speedtype || "—";

        // base cells (preserve baseHeaders order)
        const tds = baseHeaders.map(h => {
            let v = dataRow[h] ?? row[h] ?? "";
            if (h === "Requested Amount") {
                v = requestedFromDataset || row[h] || "";
            }
            if (h === "Notes") v = note;
            return `<td title="${attr(v)}">${esc(v)}</td>`;
        });

        // insert auto columns after Project Name
        tds.splice(insertIndex, 0,
            `<td title="${attr(email)}">${esc(email)}</td>`,
            `<td title="${attr(speedtype)}">${esc(speedDisplay)}</td>`
        );

        // add mapped extra columns (in selected order)
        const extraCols = selectedExtras.map(h => esc(dataRow[h] ?? row[h] ?? "—"));
        tds.push(...extraCols.map(v => `<td>${v}</td>`));

        // proposal link
        const url = findProposalUrlByName(project, app);
        const linkHTML = url
            ? `<a href="${attr(url)}" target="_blank" rel="noopener" style="color:var(--teal);text-decoration:underline" title="${attr(url)}">${esc(truncate(url.replace(/^https?:\/\//, ""), 50))}</a>`
            : `<span class="text-muted">—</span>`;
        tds.push(`<td>${linkHTML}</td>`);

        // actions (use encode/decode for safety)
        tds.push(`
            <td class="actions-col">
                <button class="btn btn-sm btn-primary" onclick="openDetail(decodeURIComponent('${encodeURIComponent(project)}'))">Open</button>
            </td>
        `);

        return `<tr>${tds.join("")}</tr>`;
    }).join("");
}

// Export approved data
export async function exportApproved(app) {
    const tab = app.activeTab;
    if (!tab) return notify("No dataset selected", "error");

    const selectedExtras = Array.from(app.approvedSelectedExtras || []);
    const baseHeaders = app.approved.headers.filter(h => !["Email", "Speedtype"].includes(h));
    const projectIdx = baseHeaders.indexOf("Project Name");
    const insertIndex = projectIdx === -1 ? 0 : projectIdx + 1;

    // CSV headers (Email / Speedtype inserted after Project Name). Use plain names for CSV.
    const headers = [
        ...baseHeaders.slice(0, insertIndex),
        "Email",
        "Speedtype",
        ...baseHeaders.slice(insertIndex),
        ...selectedExtras,
        "Proposal Link"
    ];

    const matchCol = tab.matchColumn || tab.headers?.[0];

    const rows = app.approved.data.map(r => {
        const project = r["Project Name"] || "";
        const dataRow = (tab.data || []).find(row => String(row[matchCol] || "").trim() === String(project).trim()) || {};
        const joined = Object.values(dataRow).join(" ");
        const requestedFromDataset = getRequestedAmountFromRow(dataRow);

        // email detection: prefer literal email in the row, then selected email column, then approved value
        const emailMatch = joined.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : (dataRow[$("ap-email")?.value] || r["Email"] || "");

        // speedtype detection (validated to your rule)
        const speedtype = detectSpeedtypeFromRow(dataRow, r, $("ap-extra")?.value) || (r["Speedtype"] || "");

        const out = {};
        for (const h of headers) {
            if (h === "Email") {
                out[h] = email;
            } else if (h === "Speedtype") {
                out[h] = speedtype;
            } else if (h === "Proposal Link") {
                const url = findProposalUrlByName(project, app);
                out[h] = url || "";
            } else if (selectedExtras.includes(h)) {
                out[h] = dataRow[h] ?? r[h] ?? "";
            } else if (h === "Requested Amount") {
                out[h] = requestedFromDataset || r[h] || "";
            } else {
                // base headers
                if (h === "Notes") {
                    out[h] = app.proposalNotes[project] ?? r[h] ?? dataRow[h] ?? "";
                } else {
                    out[h] = r[h] ?? dataRow[h] ?? "";
                }
            }
        }
        return out;
    });

    const csv = CSV.stringify(headers, rows);
    download(csv, "approved.csv", "text/csv");
    notify("Approved data exported", "info");
}

// Remap approved data
export async function remapApproved(app, renderApproved, renderDashboard) {
    const tab = app.activeTab;
    if (!tab) return notify("No dataset selected", "error");

    const emailCol = $("ap-email")?.value;
    const extraCol = $("ap-extra")?.value;
    if (!emailCol || !extraCol) {
        return notify("Please select Email and Speedtype columns before remapping.", "error");
    }

    // Nothing to remap if nothing has been approved yet.
    if (!Array.isArray(app.approved.data) || app.approved.data.length === 0) {
        return notify("No approved projects to remap.", "warning");
    }

    const matchCol = tab.matchColumn || tab.headers?.[0];

    // Build a case-insensitive index of the dataset by project key
    const datasetIndex = new Map();
    (tab.data || []).forEach(row => {
        const key = String(row[matchCol] ?? "").trim().toLowerCase();
        if (key) datasetIndex.set(key, row);
    });

    // Ensure the Approved table has a Speedtype column to display into
    if (!app.approved.headers.includes("Speedtype")) {
        app.approved.headers.push("Speedtype");
    }

    // Update ONLY existing approved rows
    const updated = app.approved.data.map(r => {
        const project = String(r["Project Name"] || "").trim();
        const key = project.toLowerCase();
        const src = datasetIndex.get(key);

        const out = { ...r };

        // Refresh fields that come from the dataset row
        if (src) {
            out["Email"] = src[emailCol] ?? "";
            // use the centralized detector to compute a robust Speedtype (only valid 8-digit starting with 1 saved)
            out["Speedtype"] = detectSpeedtypeFromRow(src, r, extraCol) || "";
            const requested = getRequestedAmountFromRow(src);
            if (requested) out["Requested Amount"] = requested;
        }

        // Re-sync from meta (in case amounts/status/notes changed in the tracker)
        if (project) {
            if (app.proposalAmounts[project] != null) out["Given Amount"] = app.proposalAmounts[project];
            if (app.proposalStatus[project] != null) out["Funding Status"] = app.proposalStatus[project];
            if (app.proposalNotes[project] != null) out["Notes"] = app.proposalNotes[project];
        }

        return out;
    });

    app.approved.data = updated;
    await storage.saveApprovedData(app.selectedId, app.approved.data);

    renderApproved(app);
    renderDashboard(app);
    notify(`Remapped ${updated.length} approved record${updated.length !== 1 ? "s" : ""}.`, "success");
}

// Window functions for approved row operations
window.app_editApproved = (ri, app, renderApproved, renderDashboard) => {
    const row = app.approved.data[ri];
    if (!row) return;
    const amount = prompt("Edit Given Amount:", row["Given Amount"] || "");
    if (amount === null) return;
    row["Given Amount"] = amount;
    const status = prompt("Edit Funding Status:", row["Funding Status"] || "");
    if (status !== null) row["Funding Status"] = status;
    storage.saveApprovedData(app.selectedId, app.approved.data);
    renderApproved(app);
    renderDashboard(app);
    notify("Approved row updated", "success");
};

window.app_deleteApproved = async (ri, app, renderApproved, renderDashboard) => {
    if (!confirm("Delete this approved record?")) return;
    app.approved.data.splice(ri, 1);
    await storage.saveApprovedData(app.selectedId, app.approved.data);
    renderApproved(app);
    renderDashboard(app);
    notify("Approved row deleted", "success");
};
