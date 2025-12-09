/**
 * Survey Functions
 *
 * This module handles survey-related operations including finding proposal URLs,
 * detecting speedtype, updating proposal links, rendering surveys, submitting,
 * and exporting survey data.
 */

import { $, setText, esc, attr, notify, looksLikeUrl, canonicalizeSharePointLink, CSV, download, fmtMoney, toLocalYMD } from './utils.js';
import { storage } from './storage.js';

const REQUEST_KEYS = [
    "Amount", "Requested Amount", "Amount Requested", "Total Requested",
    "Submission Amount", "Budget", "Q7",
    "Enter the total cost requested in your proposal"
];

// Find proposal URL by project name
export function findProposalUrlByName(name, app) {
    const tab = app.activeTab; if (!tab || !name) return null;
    const matchCol = tab.matchColumn || tab.headers[0];
    const idx = (tab.data || []).findIndex(r => String(r[matchCol] || "").trim().toLowerCase() === String(name).trim().toLowerCase());
    if (idx < 0) return null;

    const row = tab.data[idx];
    const rowLinks = tab.linkMap?.[idx];
    const pref = ["Proposal", "Proposal Link", "Link", "URL", "Application", "Document", "Doc", "Attachment"];

    // Prefer explicit linkMap entries
    if (rowLinks) {
        for (const h of pref) { if (rowLinks[h]) return canonicalizeSharePointLink(rowLinks[h]); }
        const first = Object.values(rowLinks).find(Boolean);
        if (first) return canonicalizeSharePointLink(first);
    }

    // Last‑resort: scan the row values for literal URLs
    for (const col of Object.keys(row || {})) {
        const v = String(row[col] ?? "").trim();
        if (looksLikeUrl(v)) return canonicalizeSharePointLink(v);
    }

    return null;
}

// Detect speedtype from row data
export function detectSpeedtypeFromRow(dataRow = {}, approvedRow = {}, extraColName) {
    // Enforce: exactly 8 digits and starting with '1' -> /^1\d{7}$/
    const VALID = /^1\d{7}$/;
    const normalize = s => String(s || "").replace(/\D/g, "");

    // 1) explicit mapped column (user-selected)
    if (extraColName && dataRow && dataRow[extraColName]) {
        const cand = normalize(dataRow[extraColName]);
        if (VALID.test(cand)) return cand;
    }

    // 2) known header names
    const known = [
        "Speedtype", "Speed Type", "Speed Type #", "SpeedType",
        "Speed Code", "Speed Code #", "Account", "Account #",
        "Account Number", "Acct", "Acct #"
    ];
    for (const h of known) {
        if (dataRow && dataRow[h]) {
            const cand = normalize(dataRow[h]);
            if (VALID.test(cand)) return cand;
        }
    }

    // 3) scan joined row values for patterns like "1########", "ST-1########", or longer digit runs containing an 8-digit starting with 1
    const joined = Object.values(dataRow || {}).join(" ");
    if (joined) {
        // direct 8-digit starting with 1
        const m = joined.match(/\b1\d{7}\b/);
        if (m && m[0]) {
            const cand = normalize(m[0]);
            if (VALID.test(cand)) return cand;
        }

        // prefixed patterns (ST, Acct, etc.)
        const pref = joined.match(/\b(?:ST|S|Acct|Account|ACCT)[\-\s:]*1\d{7}\b/ig);
        if (pref && pref.length) {
            const mm = pref[0].match(/1\d{7}/);
            if (mm && mm[0] && VALID.test(mm[0])) return mm[0];
        }

        // longer digit runs: extract any 8-digit substring that starts with 1
        const runs = joined.match(/\d{8,}/g);
        if (runs) {
            for (const r of runs) {
                const norm = normalize(r);
                for (let i = 0; i <= norm.length - 8; i++) {
                    const sub = norm.substr(i, 8);
                    if (VALID.test(sub)) return sub;
                }
            }
        }
    }

    // 4) fallback: approved row's Speedtype (if already valid)
    const fromApproved = normalize(approvedRow && approvedRow["Speedtype"]);
    if (VALID.test(fromApproved)) return fromApproved;

    // nothing valid found
    return "";
}

// Update survey proposal link
export function updateSurveyProposalLink(app, findProposalUrlByName) {
    const a = $("svy-prop"); const input = $("svy-projectName");
    if (!a || !input) return;
    const name = (input.value || "").trim();
    const url = findProposalUrlByName(name, app);
    if (url) {
        a.href = url; a.style.pointerEvents = "auto"; a.style.opacity = "1";
        a.classList.add("btn-primary");
        a.setAttribute("title", "Open proposal");
    } else {
        a.removeAttribute("href"); a.style.pointerEvents = "none"; a.style.opacity = ".5";
        a.classList.remove("btn-primary");
        a.setAttribute("title", "Type exact project name to enable");
    }
    updateSurveyProjectMeta(app, name);
}

export function refreshSurveyTypeahead(app) {
    const list = $("svy-project-options");
    const meta = $("svy-project-meta");
    if (!list) return;
    const tab = app.activeTab;
    if (!tab) {
        list.innerHTML = "";
        if (meta) meta.textContent = "No dataset selected.";
        return;
    }
    const matchCol = tab.matchColumn || tab.headers?.[0];
    const options = (tab.data || []).map(row => {
        const project = row[matchCol];
        if (!project) return "";
        const stats = buildProjectMeta(app, project, row);
        const label = `${project} — ${stats.requested || "—"} • due ${stats.dueLabel}`;
        return `<option value="${attr(project)}" label="${attr(label)}">${attr(project)}</option>`;
    }).join("");
    list.innerHTML = options;
    if (meta && !($("svy-projectName")?.value)) meta.textContent = "Start typing to see requested amount, due date, and assignments.";
}

export function updateSurveyProjectMeta(app, projectName) {
    const meta = $("svy-project-meta");
    if (!meta) return;
    if (!projectName) {
        meta.textContent = "";
        return;
    }
    const row = findProjectRow(app, projectName);
    if (!row) {
        meta.textContent = "No matching project in current dataset.";
        return;
    }
    const stats = buildProjectMeta(app, projectName, row);
    meta.innerHTML = `
        Requested <strong>${esc(stats.requested || "—")}</strong>
        • Due <strong>${esc(stats.dueLabel)}</strong>
        • Assigned: ${stats.assigned ? esc(stats.assigned) : "<span class='text-muted'>Unassigned</span>"}
    `;
}

export function autofillReviewerName(app) {
    const input = document.querySelector("#survey input[name='reviewerName']");
    if (!input || !app?.user) return;
    if (input.value && input.dataset.autofill !== "1") return;
    const email = (app.user.email || "").toLowerCase();
    let guess = app.user.displayName || "";

    // Try mapping from reviewerDirectory (name -> email), invert to match email to name
    if (!guess && email && app.reviewerDirectory && typeof app.reviewerDirectory === "object") {
        const entry = Object.entries(app.reviewerDirectory).find(([, em]) => (em || "").toLowerCase() === email);
        if (entry) guess = entry[0];
    }

    if (!guess && email) guess = email.split("@")[0];
    if (guess) {
        input.value = guess;
        input.dataset.autofill = "1";
    }
}

function findProjectRow(app, name) {
    const tab = app.activeTab;
    if (!tab || !name) return null;
    const matchCol = tab.matchColumn || tab.headers?.[0];
    const lower = name.trim().toLowerCase();
    return (tab.data || []).find(r => String(r[matchCol] || "").trim().toLowerCase() === lower) || null;
}

function buildProjectMeta(app, project, row = {}) {
    const requestedKey = REQUEST_KEYS.find(k => row[k] != null && row[k] !== "");
    const requested = requestedKey ? fmtMoney(row[requestedKey]) : "";
    const dueRaw = app.proposalDue?.[project] || row["Due Date"] || row.Due || "";
    const dueLabel = formatDueLabel(dueRaw);
    const assigned = (app.assignments?.[project] || []).join(", ");
    return { requested, dueLabel, assigned };
}

function formatDueLabel(raw) {
    if (!raw) return "—";
    const ymd = toLocalYMD(raw);
    if (ymd) {
        const d = new Date(`${ymd}T00:00:00`);
        if (!isNaN(d)) return d.toLocaleDateString();
    }
    const parsed = new Date(raw);
    if (!isNaN(parsed)) return parsed.toLocaleDateString();
    return String(raw);
}

// Render survey
export function renderSurvey(app, filter = "") {
    const f = (filter || "").toLowerCase();
    const list = app.surveys.filter(s => !f || (s.projectName || "").toLowerCase().includes(f));
    setText("svy-count", `${list.length} responses`);
    const cards = $("svy-cards");
    if (!cards) return;

    const bodyField = (l, v) => v ? `<div class="mt-8"><strong>${l}:</strong> ${esc(v)}</div>` : "";

    cards.innerHTML = list.map(s => {
        const ts = s.timestamp ? new Date(s.timestamp).toLocaleString() : "";
        const compactMeta = [
            s.reviewerName ? `Reviewer: ${esc(s.reviewerName)}` : "",
            s.year ? `Year: ${esc(s.year)}` : "",
            s.projectType ? `Type: ${esc(s.projectType)}` : ""
        ].filter(Boolean).join(" • ");

        return `
            <div class="svy-row" id="svy-${esc(s.id)}">
                <div class="svy-top" onclick="app_toggleSurveyRow('${esc(s.id)}')">
                    <div class="svy-left">
                        <div class="svy-title">${esc(s.projectName || "(no project)")}</div>
                        <div class="svy-meta">• ${esc(ts)} • ${esc(compactMeta)}</div>
                    </div>
                    <div class="svy-actions">
                        <button class="btn btn-sm" onclick="event.stopPropagation(); app_editSurvey('${esc(s.id)}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); app_deleteSurvey('${esc(s.id)}')">Delete</button>
                    </div>
                </div>
                <div class="svy-body" id="svyb-${esc(s.id)}" style="display:none">
                    ${bodyField("Overall", s.overall)}
                    ${bodyField("Line Items", s.lineItems)}
                    ${bodyField("Funding", s.funding)}
                    ${s.impact ? `<div><strong>Impact:</strong> ${esc(s.impact)}</div>` : ""}
                </div>
            </div>`;
    }).join("");
}

// Submit survey
export async function submitSurvey(fd, app, renderSurvey, renderTracker, renderDashboard, updateSurveyProposalLink) {
    const base = {
        projectName: (fd.get("projectName") || "").trim(),
        reviewerName: (fd.get("reviewerName") || "").trim(),
        year: (fd.get("year") || "").trim(),
        projectType: (fd.get("projectType") || "").trim(),
        impact: (fd.get("impact") || "").trim(),
        overall: (fd.get("overall") || "").trim(),
        lineItems: (fd.get("lineItems") || "").trim(),
        funding: (fd.get("funding") || "").trim(),
    };

    if (!base.projectName || !base.reviewerName) {
        return notify("Please fill in Project Name and Reviewer Name.", "error");
    }

    const nowIso = new Date().toISOString();
    const id = app.editingSurveyId || ("s_" + Date.now());
    const s = { id, ...base, timestamp: nowIso };

    await storage.saveSurvey(app.selectedId, s);
    const i = app.surveys.findIndex(x => x.id === id);
    if (i >= 0) app.surveys[i] = s;
    else app.surveys.unshift(s);

    $("survey").reset();
    autofillReviewerName(app);
    updateSurveyProjectMeta(app, "");
    app.editingSurveyId = null;
    $("svy-submit").textContent = "Submit Review";

    renderSurvey(app, ($("svy-filter")?.value || "").trim().toLowerCase());
    renderTracker();
    renderDashboard();
    updateSurveyProposalLink();
}

// Export surveys
export function exportSurveys(app) {
    const headers = ["id", "projectName", "reviewerName", "year", "projectType", "impact", "overall", "lineItems", "funding", "timestamp"];
    const csv = CSV.stringify(headers, app.surveys.map(s => s));
    download(csv, "surveys.csv", "text/csv");
    notify("Surveys exported", "info");
}

// Window functions for survey row operations
window.app_toggleSurveyRow = (id) => {
    const el = $("svyb-" + id); if (!el) return;
    el.style.display = (el.style.display === "none" || !el.style.display) ? "block" : "none";
};

window.app_editSurvey = (id) => {
    const s = app.surveys.find(x => x.id === id); if (!s) return;
    app.editingSurveyId = id;
    const form = $("survey");
    form.projectName.value = s.projectName || "";
    form.reviewerName.value = s.reviewerName || "";
    form.year.value = s.year || "";
    form.projectType.value = s.projectType || "Senior Design";
    form.impact.value = s.impact || "";
    form.overall.value = s.overall || "";
    form.lineItems.value = s.lineItems || "";
    form.funding.value = s.funding || "";
    $("svy-submit").textContent = "Save Review";
    window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 90, behavior: "smooth" });
    form.overall.focus();
    updateSurveyProposalLink();
};

window.app_deleteSurvey = async (id) => {
    if (!confirm("Delete this survey response?")) return;
    await storage.deleteSurvey(app.selectedId, id);
    app.surveys = app.surveys.filter(x => x.id !== id);
    renderSurvey(($("svy-filter")?.value || "").trim().toLowerCase());
    renderTracker();
    renderDashboard();
    notify("Survey deleted", "success");
};
