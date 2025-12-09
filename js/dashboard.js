/**
 * Dashboard Rendering Functions
 *
 * This module handles the rendering of dashboard metrics and reviewer
 * dashboard with progress tracking.
 */

import { setText, esc, firstName } from './utils.js';

// Render Dashboard metrics
export function renderDashboard(app) {
    const tab = app.activeTab;
    if (!tab) {
        setText("st-proposals", "0");
        setText("st-status", "0 / 0 / 0");
        setText("st-notes", "0");
        setText("st-avg", "$0");
        setText("st-granted", "$0");
        return;
    }

    const rows = tab.data || [];
    let totalRequested = 0, reqCnt = 0;
    const amountKeys = [
        "Amount", "Requested Amount", "Amount Requested",
        "Total Requested", "Submission Amount", "Budget", "Q7",
        "Enter the total cost requested in your proposal"
    ];

    for (const r of rows) {
        const key = amountKeys.find(k => r[k] != null && r[k] !== "");
        if (!key) continue;
        const n = parseFloat(String(r[key]).replace(/[^0-9.\-]/g, ""));
        if (!isNaN(n)) { totalRequested += n; reqCnt++; }
    }

    const notesCount = app.surveys.filter(s =>
        (s.overall && s.overall.trim()) ||
        (s.lineItems && s.lineItems.trim()) ||
        (s.funding && s.funding.trim())
    ).length;

    let full = 0, part = 0, none = 0;
    let totalGranted = 0;
    for (const r of app.approved.data || []) {
        const st = String(r["Funding Status"] || "").toLowerCase();
        if (st.includes("full")) full++;
        else if (st.includes("part")) part++;
        else if (st.includes("none") || st.includes("no funding")) none++;

        const g = parseFloat(String(r["Given Amount"] || "").replace(/[^0-9.\-]/g, ""));
        if (!isNaN(g)) totalGranted += g;
    }

    setText("st-proposals", rows.length);
    setText("st-status", `${full} / ${part} / ${none}`);
    setText("st-notes", notesCount);
    setText("st-avg", "$" + (reqCnt ? Math.round(totalRequested / reqCnt).toLocaleString() : "0"));
    setText("st-granted", "$" + Math.round(totalGranted).toLocaleString());
}

// Render Reviewer Dashboard
export function renderReviewerDashboard(app) {
    const trackerData = app.trackerData || app.tracker?.data || [];
    const reviewers = {};
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const norm = s => String(s || "").toLowerCase().trim();

    for (const item of trackerData) {
        const project = (item["Project Name"] || item.Project || "").trim();
        if (!project) continue;

        // Allow multiple assignees in one cell: "Alice & Bob, Charlie and Dana"
        const rawReviewer = String(item.Reviewer || item["Reviewer Name"] || "");
        const assignees = rawReviewer
            .split(/[,/&]|(?:\band\b)/i)
            .map(s => s.trim())
            .filter(Boolean);

        if (assignees.length === 0) continue;

        for (const name of assignees) {
            if (!reviewers[name]) reviewers[name] = { assigned: [], submittedKeys: new Set(), dueNext7: 0 };
            reviewers[name].assigned.push(item);

            // A note is "submitted" if there's a survey whose project matches AND whose reviewerName
            // appears in the Tracker assignee cell — match by first name as well as full inclusion.
            const hasSubmitted = app.surveys.some(s => {
                const sProj = norm(s.projectName);
                const sName = norm(s.reviewerName);
                const thisProj = norm(project);
                const aName = norm(name);
                const inCell = norm(rawReviewer);
                const sFirst = firstName(s.reviewerName);
                const aFirst = firstName(name);
                return sProj === thisProj && (
                    inCell.includes(sName) ||
                    sName.includes(aName) ||
                    sFirst === aFirst ||
                    inCell.includes(sFirst)
                );
            });

            if (hasSubmitted) reviewers[name].submittedKeys.add(norm(project));

            // "Notes Due (Next 7 Days)" = due within next 7 days and not yet submitted
            const dueRaw = item["Due Date"] || item.Due || "";
            const due = dueRaw ? new Date(dueRaw) : null;
            if (due && !isNaN(due) && due >= now && due <= weekAhead && !hasSubmitted) {
                reviewers[name].dueNext7++;
            }
        }
    }

    const body = document.getElementById("reviewer-body");
    if (!body) return;

    const rows = Object.entries(reviewers).map(([revName, info], i) => {
        const assignedCount = info.assigned.length;
        const submittedCount = info.submittedKeys.size;
        const pct = assignedCount ? Math.round((submittedCount / assignedCount) * 100) : 0;

        const details = info.assigned.map(a => {
            const proj = (a["Project Name"] || a.Project || "").trim();
            const isSubmitted = info.submittedKeys.has(norm(proj));
            const dueStr = a["Due Date"] || a.Due || "—";
            return `
                <div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08)">
                    <strong>${esc(proj)}</strong><br>
                    <span class="text-muted">Due: ${esc(dueStr)} • ${isSubmitted ? "✅ Submitted" : "❌ Not yet"}</span>
                </div>
            `;
        }).join("");

        return `
            <tr class="rev-row" onclick="document.getElementById('rev-detail-${i}').classList.toggle('hidden')">
                <td>${esc(revName)}</td>
                <td>${submittedCount} / ${assignedCount}</td>
                <td>${info.dueNext7}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px">
                        <div class="prog" style="background:#334155;height:8px;width:80px;border-radius:6px;overflow:hidden">
                            <div class="prog-fill" style="height:100%;background:#06B6D4;width:${pct}%"></div>
                        </div>
                        <span class="prog-label">${pct}%</span>
                    </div>
                </td>
            </tr>
            <tr id="rev-detail-${i}" class="rev-detail hidden">
                <td colspan="4">${details}</td>
            </tr>
        `;
    }).join("");

    body.innerHTML = rows || `<tr><td colspan="4" class="text-muted">No tracker data available.</td></tr>`;

    // Update column header to reflect the new meaning
    const hdr = document.querySelector('#reviewer-table thead th:nth-child(3) .th-inner');
    if (hdr) hdr.textContent = 'Notes Due (Next 7 Days)';
}
