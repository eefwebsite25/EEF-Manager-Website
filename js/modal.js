/**
 * Modal Functions
 *
 * This module handles the detail modal operations including opening details,
 * approve/unapprove functionality, autosave for internal notes, and showing
 * previous cycles for the same proposal.
 */

import { $, esc, notify, fmtMoney } from './utils.js';
import { storage } from './storage.js';
import { clearModalToasts } from './ui-builders.js';
import { getProposalUrl } from './tracker.js';
import { detectSpeedtypeFromRow } from './survey.js';

// === Main: Open detail modal ===
export async function openDetail(project, app, renderApproved, renderTracker, renderDashboard) {
    const overlay = $("detail");
    if (!overlay) return;

    overlay.classList.add("overlay");
    overlay.classList.remove("hidden");
    clearModalToasts();

    const tab = app.activeTab;
    if (!tab) return;
    const tabId = app.selectedId;
    const matchCol = tab.matchColumn;

    // --- Proposal Link ---
    const url = getProposalUrl(project, tab, matchCol);
    const linkBtn = $("dt-prop");
    const notesArea = $("dt-notes");
    const internalNote = $("dt-note");
    const title = $("dt-title");

    if (title) title.textContent = project;

    if (linkBtn) {
        if (url) {
            linkBtn.href = url;
            linkBtn.style.display = "inline-flex";
        } else {
            linkBtn.style.display = "none";
        }
    }

    // --- Internal Note Autosave (debounced, scoped per project) ---
    if (internalNote) {
        internalNote.value = app.proposalNotes[project] || "";
        app._currentProject = project; // ensure active tracking
        let noteSaveTimer = null;

        internalNote.oninput = (e) => {
            clearTimeout(noteSaveTimer);
            const val = e.target.value;
            noteSaveTimer = setTimeout(async () => {
                const activeProj = app._currentProject;
                if (!activeProj) return;

                const statusEl = $("autosave-status");
                if (statusEl) statusEl.textContent = "Saving...";
                app.proposalNotes[activeProj] = val;

                await storage.saveProposalField(app.selectedId, activeProj, { notes: val });
                if (statusEl) statusEl.textContent = "Saved";

                setTimeout(() => {
                    const s2 = $("autosave-status");
                    if (s2) s2.textContent = "";
                }, 2500);
            }, 2500);
        };
    }

    // --- Reviewer Notes (Collapsible) ---
    const related = app.surveys.filter(s => s.projectName === project);
    if (notesArea) {
        notesArea.innerHTML = related.length
            ? related.map((s, i) => {
                const timestamp = s.timestamp ? new Date(s.timestamp).toLocaleString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                }) : '';

                const initials = s.reviewerName ? s.reviewerName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '?';

                return `
                <div class="rev-card" id="rev-${i}">
                    <div class="rev-header">
                        <div class="rev-header-left">
                            <div class="rev-avatar">${initials}</div>
                            <div class="rev-info">
                                <div class="rev-name">${esc(s.reviewerName)}</div>
                                <div class="rev-meta">
                                    ${esc(s.projectType)} • ${esc(s.year)}${timestamp ? ` • ${timestamp}` : ''}
                                </div>
                            </div>
                        </div>
                        <span class="rev-arrow">▼</span>
                    </div>
                    <div class="rev-body">
                        ${s.overall ? `
                            <div class="rev-section">
                                <div class="rev-section-label">
                                    <span class="rev-section-icon">💭</span>
                                    <span>Overall Thoughts</span>
                                </div>
                                <div class="rev-section-content">${esc(s.overall)}</div>
                            </div>
                        ` : ""}
                        ${s.lineItems ? `
                            <div class="rev-section">
                                <div class="rev-section-label">
                                    <span class="rev-section-icon">📋</span>
                                    <span>Line Items</span>
                                </div>
                                <div class="rev-section-content">${esc(s.lineItems)}</div>
                            </div>
                        ` : ""}
                        ${s.funding ? `
                            <div class="rev-section">
                                <div class="rev-section-label">
                                    <span class="rev-section-icon">💰</span>
                                    <span>Funding Recommendation</span>
                                </div>
                                <div class="rev-section-content">${esc(s.funding)}</div>
                            </div>
                        ` : ""}
                        ${s.impact ? `
                            <div class="rev-section">
                                <div class="rev-section-label">
                                    <span class="rev-section-icon">👥</span>
                                    <span>Impact</span>
                                </div>
                                <div class="rev-section-content">${esc(s.impact)} people</div>
                            </div>
                        ` : ""}
                    </div>
                </div>`;
            }).join("")
            : `<div class="rev-empty">
                <div class="rev-empty-icon">📝</div>
                <div class="rev-empty-text">No reviewer notes yet</div>
                <div class="rev-empty-subtext">Submit a review to see notes appear here</div>
            </div>`;

        notesArea.querySelectorAll(".rev-header").forEach(header => {
            header.addEventListener("click", () => {
                const body = header.nextElementSibling;
                const arrow = header.querySelector(".rev-arrow");
                const card = header.closest(".rev-card");
                const open = body.classList.toggle("open");
                card.classList.toggle("expanded");
                arrow.textContent = open ? "▲" : "▼";
            });
        });
    }

    // --- Previous Years / Previous Cycles section ---
    await renderPreviousYears(project, app);

    // --- Tab Switching Logic ---
    const modalTabs = document.querySelectorAll('.modal-tab');
    const modalTabContents = document.querySelectorAll('.modal-tab-content');

    modalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-tab');

            // Remove active class from all tabs and contents
            modalTabs.forEach(t => t.classList.remove('active'));
            modalTabContents.forEach(c => c.classList.remove('active'));

            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const targetContent = document.querySelector(`.modal-tab-content[data-content="${targetTab}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });

    // --- Amount / Status Save ---
    const amtInput = $("dt-amount");
    const statusSel = $("dt-status");
    const saveBtn = $("dt-save-amount");

    if (amtInput && statusSel) {
        const currentAmt = app.proposalAmounts[project];
        const currentStatus = app.proposalStatus[project];
        amtInput.value = currentAmt != null ? currentAmt : "";
        statusSel.value = currentStatus || "";
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            const valRaw = amtInput?.value || "";
            const val = valRaw === "" ? "" : Number(valRaw);
            const status = statusSel?.value || "";
            app.proposalAmounts[project] = val;
            app.proposalStatus[project] = status;

            const amtStatusEl = $("amt-status");
            if (amtStatusEl) amtStatusEl.textContent = "Saving.";

            await storage.saveProposalField(app.selectedId, project, {
                givenAmount: val,
                fundingStatus: status
            });

            if (amtStatusEl) amtStatusEl.textContent = "Saved";
            setTimeout(() => {
                const s2 = $("amt-status");
                if (s2) s2.textContent = "";
            }, 3000);

            renderTracker();
            renderDashboard();
        };
    }

    // --- Approve / Unapprove Toggle ---
    const btn = $("dt-approve");
    if (btn) {
        if (!app.isAdmin) {
            btn.style.display = "none";
        } else {
            btn.style.display = "";
            const idx = app.approved.data.findIndex(r => r["Project Name"] === project);
            updateApproveButton(idx !== -1);

            btn.onclick = async () => {
                const existing = app.approved.data.findIndex(r => r["Project Name"] === project);
                const amt = amtInput?.value || "";
                const status = statusSel?.value || "";
                const note = internalNote?.value || "";
                const emailField = $("ap-email")?.value;
                const extraField = $("ap-extra")?.value;
                const matchRow = tab.data.find(r => r[tab.matchColumn] === project);
                const email = matchRow ? (emailField ? (matchRow[emailField] || "") : "") : "";
                const approvedExisting = app.approved.data.find(r => r["Project Name"] === project) || {};
                const detectedSpeed = detectSpeedtypeFromRow(matchRow || {}, approvedExisting, extraField);
                const speedtype = detectedSpeed || "";

                if (existing === -1) {
                    const newRow = {
                        "Project Name": project,
                        "Email": email,
                        "Requested Amount": matchRow ? matchRow["Requested Amount"] || "" : "",
                        "Given Amount": amt,
                        "Funding Status": status,
                        "Notes": note,
                        "Speedtype": speedtype
                    };
                    app.approved.data.push(newRow);
                    await storage.saveApprovedData(tabId, app.approved.data);
                    const amtStatusEl = $("amt-status");
                    if (amtStatusEl) amtStatusEl.textContent = "Approved ✓";
                } else {
                    app.approved.data.splice(existing, 1);
                    await storage.saveApprovedData(tabId, app.approved.data);
                    const amtStatusEl = $("amt-status");
                    if (amtStatusEl) amtStatusEl.textContent = "Unapproved ✗";
                }

                updateApproveButton(existing === -1);
                renderApproved();
                renderTracker();
                renderDashboard();
                setTimeout(() => {
                    const s2 = $("amt-status");
                    if (s2) s2.textContent = "";
                }, 3000);
            };
        }
    }

    // --- Close button ---
    const closeBtn = $("dt-x");
    if (closeBtn) {
        closeBtn.onclick = () => {
            overlay.classList.remove("overlay");
            overlay.classList.add("hidden");
            clearModalToasts();
        };
    }
}

// === Previous Years helpers ===

// Keys used in many sheets for requested amount
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

// Normalize name: lowercase, strip punctuation, collapse spaces
function normalizeName(name) {
    if (!name) return "";
    return String(name)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Simple token-based similarity (Jaccard over words)
function similarityScore(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const aTokens = new Set(a.split(" "));
    const bTokens = new Set(b.split(" "));
    if (!aTokens.size || !bTokens.size) return 0;

    let inter = 0;
    for (const t of aTokens) {
        if (bTokens.has(t)) inter++;
    }
    const union = new Set([...aTokens, ...bTokens]).size;
    return union ? inter / union : 0;
}

// Pull "Requested" amount from a raw data row
function getRequestedAmountFromRowLocal(row = {}) {
    if (!row) return "";
    const exact = REQUEST_KEYS.find(k => row[k] != null && row[k] !== "");
    if (exact) return row[exact];

    const fuzzyKey = Object.keys(row).find(k => /request(ed)?/i.test(k) && row[k] != null && row[k] !== "");
    if (fuzzyKey) return row[fuzzyKey];

    const amountKey = Object.keys(row).find(k => /amount|budget/i.test(k) && row[k] != null && row[k] !== "");
    if (amountKey) return row[amountKey];

    return "";
}

// Render "Previous Years" section
async function renderPreviousYears(project, app) {
    const container = $("dt-prev");
    if (!container) return;

    const normQuery = normalizeName(project);
    if (!normQuery) {
        container.innerHTML = `<div class="text-muted text-sm">No project name to match.</div>`;
        return;
    }

    container.innerHTML = `<div class="text-muted text-sm">Searching for similar proposals in previous cycles…</div>`;

    const matches = [];
    const currentId = app.selectedId;
    const tabs = app.tabs || [];

    for (const tab of tabs) {
        if (!tab || tab.id === currentId) continue;

        const headers = tab.headers || [];
        const matchCol =
            tab.matchColumn ||
            (headers.includes("Project Name") ? "Project Name" : headers[0]);

        if (!matchCol || !Array.isArray(tab.data)) continue;

        // Load proposal meta for this tab (for givenAmount)
        let meta = null;
        try {
            meta = await storage.loadProposalMeta(tab.id);
        } catch (e) {
            console.warn("Failed to load meta for tab", tab.id, e);
        }
        const amounts = (meta && meta.amounts) || {};
        const normAmountMap = {};
        Object.entries(amounts).forEach(([name, val]) => {
            normAmountMap[normalizeName(name)] = val;
        });

        for (const row of tab.data) {
            const rawName = String(row[matchCol] ?? "").trim();
            if (!rawName) continue;

            const normName = normalizeName(rawName);
            if (!normName) continue;

            const score = similarityScore(normQuery, normName);
            if (score < 0.7) continue; // threshold for "similar"

            const requested = getRequestedAmountFromRowLocal(row);
            const given = normAmountMap[normName] ?? "";
            const url = getProposalUrl(rawName, tab, matchCol);

            matches.push({
                cycle: tab.name || tab.id,
                projectName: rawName,
                requested,
                given,
                url,
                score
            });
        }
    }

    if (!matches.length) {
        container.innerHTML = `<div class="text-muted text-sm">No similar proposals found in previous cycles.</div>`;
        return;
    }

    // Sort by similarity, then by cycle label
    matches.sort((a, b) => (b.score - a.score) || String(a.cycle).localeCompare(String(b.cycle)));

    // Totals
    const toNumber = (val) => {
        if (val == null || val === "") return 0;
        const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
        return isNaN(num) ? 0 : num;
    };

    let totalRequested = 0;
    let totalGiven = 0;
    matches.forEach(m => {
        totalRequested += toNumber(m.requested);
        totalGiven += toNumber(m.given);
    });

    const totalHtml = `
        <div style="margin-bottom:8px;font-size:13px;">
            <strong>Totals across matched cycles:</strong>
            <div style="margin-top:4px;display:flex;gap:12px;flex-wrap:wrap;">
                <span>Requested: <strong>${fmtMoney(totalRequested)}</strong></span>
                <span>Funded: <strong>${fmtMoney(totalGiven)}</strong></span>
            </div>
        </div>
    `;

    const listHtml = matches.map(m => `
        <div class="prev-row"
             style="display:flex;justify-content:space-between;align-items:center;
                    padding:6px 0;border-bottom:1px solid rgba(148,163,184,0.2);">
            <div>
                <div style="font-weight:600;">${esc(m.projectName)}</div>
                <div style="font-size:12px;color:#9CA3AF;">${esc(m.cycle)}</div>
                <div style="font-size:12px;margin-top:2px;">
                    <span class="text-muted">Requested:</span>
                    ${m.requested ? fmtMoney(toNumber(m.requested)) : "—"}
                    &nbsp;•&nbsp;
                    <span class="text-muted">Funded:</span>
                    ${m.given ? fmtMoney(toNumber(m.given)) : "—"}
                </div>
            </div>
            <div>
                ${m.url
                    ? `<a class="btn btn-sm" href="${m.url}" target="_blank" rel="noopener">Open Proposal</a>`
                    : `<span class="text-muted" style="font-size:11px;">No PDF link</span>`
                }
            </div>
        </div>
    `).join("");

    container.innerHTML = totalHtml + listHtml;
}

// Update approve button state
export function updateApproveButton(isApproved) {
    const b = $("dt-approve");
    if (!b) return;
    if (isApproved) {
        b.textContent = "Unapprove";
        b.classList.remove("btn-success");
        b.classList.add("btn-danger");
    } else {
        b.textContent = "Approve";
        b.classList.remove("btn-danger");
        b.classList.add("btn-success");
    }
}
