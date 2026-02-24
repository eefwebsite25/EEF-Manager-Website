/**
 * UI Builders
 *
 * This module provides functions to mount UI components for Survey, Tracker,
 * Approved tabs, and the Detail modal. Also includes modal toast utilities.
 */

import { $ } from './utils.js';

// Mount Survey UI
export function mountSurveyUI() {
    $("survey-container").innerHTML = `
        <div class="card">
            <div class="card-header"><strong>Submit Review</strong></div>
            <div class="card-body">
                <form id="survey">
                    <div class="flex gap-12 flex-wrap" style="align-items:flex-end">
                        <div style="flex:1 1 360px">
                            <label>Project Name*</label>
                            <div class="flex gap-8" style="align-items:center">
                                <input name="projectName" id="svy-projectName" list="svy-project-options" autocomplete="off" required placeholder="Search project by typing 3+ letters">
                                <datalist id="svy-project-options"></datalist>
                                <a id="svy-prop" class="btn btn-sm w-auto" target="_blank" rel="noopener" style="pointer-events:none; opacity:.5">Proposal</a>
                            </div>
                            <div id="svy-project-meta" class="text-muted text-sm mt-6"></div>
                        </div>
                        <div style="flex:1 1 200px"><label>Your Name*</label><input name="reviewerName" required placeholder="First Name"></div>
                        <div style="flex:0 0 120px"><label>Year</label><input type="number" name="year" value="2025" min="2000" max="2100"></div>
                        <div style="flex:1 1 200px"><label>Project Type</label>
                            <select name="projectType">
                                <option value="" selected>Not Selected</option>
                                <option>Senior Design</option>
                                <option>Club</option>
                                <option>Faculty/Dept</option>
                                <option>Competition</option>
                                <option>Equipment</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-10"><label>Impact (people)</label><input type="number" name="impact" min="0" placeholder="e.g., 120"></div>
                    <div class="mt-10"><label>Overall Thoughts</label><textarea name="overall" placeholder="2–5 sentences about the project"></textarea></div>
                    <div class="mt-10"><label>Specific Line Items</label><textarea name="lineItems" placeholder="Consumables / Big asks / Budget concerns"></textarea></div>
                    <div class="mt-10"><label>Funding Recommendation</label><textarea name="funding" placeholder="Full / Partial / None + rationale"></textarea></div>
                    <div class="flex gap-8" style="justify-content:flex-end" class="mt-10">
                        <button type="reset" class="btn">Reset</button>
                        <button type="submit" id="svy-submit" class="btn btn-primary">Submit Review</button>
                    </div>
                </form>
            </div>
        </div>

        <div class="card mt-16">
            <div class="card-header flex-between" style="align-items:center">
                <div>
                    <strong>Survey Responses</strong>
                    <div id="svy-count" class="text-muted text-sm">0 responses</div>
                </div>
                <div class="flex gap-8" style="align-items:center">
                    <input id="svy-filter" placeholder="Filter by project" class="w-220">
                    <button id="svy-do" class="btn btn-primary btn-sm">Filter</button>
                    <button id="svy-clr" class="btn btn-sm">Clear</button>
                    <button id="svy-exp" class="btn btn-sm">Export</button>
                </div>
            </div>
            <div class="card-body">
                <div id="svy-cards"></div>
            </div>
        </div>
    `;
}

// Mount Tracker UI
export function mountTrackerUI() {
    $("tracker-container").innerHTML = `
        <div class="card-header flex-between tracker-header">
            <div>
                <strong>Reviewer Progress</strong>
                <div id="trk-meta" class="text-muted text-sm">—</div>
            </div>
            <div class="flex gap-8 flex-wrap tracker-controls">
                <input id="trk-q" placeholder="Search assignee…" class="w-220">
                <button id="trk-q-clr" class="btn btn-sm btn-outline">Clear</button>
                <button id="trk-auto" class="btn btn-primary btn-sm" data-admin-only="true">Auto Assign</button>
                <button id="trk-refresh" class="btn btn-sm btn-outline">Refresh</button>
                <button id="trk-email" class="btn btn-success btn-sm" data-admin-only="true">Email Reminders</button>
            </div>
        </div>
        <div class="card-body tracker-body">
            <div class="table-wrap tracker-table scrollbar mt-8">
                <table id="trk-table">
                    <thead>
                        <tr>
                            <th>Project</th>
                            <th>Amount</th>
                            <th>Submitted / Assigned</th>
                            <th class="header-menu" id="status-header">
                                <div class="th-inner">Status</div>
                                <div class="dropdown" id="status-dropdown"></div>
                            </th>
                            <th>Actions</th>
                            <th class="header-menu" id="due-header">
    <div class="th-inner">Due Date</div>
    <div class="sort-popup" id="due-popup">
        <div class="sort-popup-inner">
            <label class="text-sm">Filter by date</label>
            <div class="due-select-wrap">
                <select id="due-filter"></select>
            </div>
        </div>
    </div>
</th>
                        </tr>
                    </thead>
                    <tbody id="trk-body"></tbody>
                </table>
            </div>
        </div>
    `;
}

// Mount Approved UI
export function mountApprovedUI() {
    $("approved-container").innerHTML = `
        <div class="card-header flex-between" style="align-items:center">
            <div>
                <strong id="ap-title">Approved</strong>
                <div id="ap-meta" class="text-muted text-sm">—</div>
            </div>
            <div class="flex gap-8">
                <button id="ap-exp" class="btn btn-sm">Export CSV</button>
            </div>
        </div>

        <div class="card-body">
            <!-- Keep ONLY the "Pull additional columns" toggles -->
            <div class="flex gap-8 flex-wrap" style="align-items:flex-end">
                <div style="flex:1 1 100%; width:100%;">
                    <label>Pull additional columns</label>
                    <div id="ap-extra-container"></div>
                </div>
            </div>

            <div class="table-wrap scrollbar mt-10">
                <table id="ap-table" style="min-width:100%">
                    <thead id="ap-head"></thead>
                    <tbody id="ap-body"></tbody>
                </table>
            </div>
        </div>
    `;
    // keep the session set used by your toggles
    app.approvedSelectedExtras = app.approvedSelectedExtras || new Set();
}

// Mount Modal UI
export function mountModal() {
    $("detail").innerHTML = `
        <div class="modal-card" style="max-width:1400px;width:96vw;">
            <div class="modal-header">
                <strong id="dt-title">Proposal Detail</strong>
                <span id="dt-x" class="close-x">&times;</span>
            </div>

            <!-- In-modal toasts -->
            <div id="dt-toasts"></div>

            <div class="modal-body" style="display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap;">
                <div style="flex:2 1 600px;min-width:480px;max-height:700px;overflow:hidden;padding-right:8px;display:flex;flex-direction:column;">
                    <div class="flex gap-8" style="align-items:center; justify-content:flex-end;margin-bottom:12px;">
                        <a id="dt-prop" class="btn btn-primary btn-sm w-auto" target="_blank" rel="noopener" style="display:none">View Full Proposal</a>
                    </div>

                    <!-- Tabs for Reviewer Notes and Previous Years -->
                    <div class="modal-tabs">
                        <button class="modal-tab active" data-tab="notes">Reviewer Notes</button>
                        <button class="modal-tab" data-tab="previous">Previous Years</button>
                    </div>

                    <!-- Tab Content -->
                    <div class="modal-tab-content active" data-content="notes" style="flex:1;overflow:auto;padding-top:12px;">
                        <div id="dt-notes"></div>
                    </div>

                    <div class="modal-tab-content" data-content="previous" style="flex:1;overflow:auto;padding-top:12px;">
                        <div id="dt-prev" style="font-size:13px;color:#9ca3af;">
                            <div>Searching for similar proposals in previous cycles…</div>
                        </div>
                    </div>
                </div>
                <div style="flex:1 1 380px;min-width:340px;">
                    <h3 style="margin:0 0 8px">Add / Edit Internal Note</h3>
                    <div id="autosave-status" style="font-size:12px;color:#9ca3af;margin-bottom:4px;"></div>
                    <textarea id="dt-note" placeholder="Internal note (not a survey response)" style="width:100%;min-height:160px;background:#334155;color:#F1F5F9;border:1px solid #334155;border-radius:10px;padding:9px 12px;"></textarea>
                    <div id="amt-status" style="font-size:12px;color:#9ca3af;margin:8px 0;"></div>
                    <div class="modal-actions flex gap-12 flex-wrap" style="padding:0;">
                        <div style="max-width:220px;flex:1 1 200px">
                            <label>Funding Status</label>
                            <select id="dt-status">
                                <option value="">(none)</option>
                                <option value="fully">Fully Funded</option>
                                <option value="partial">Partially Funded</option>
                                <option value="none">No Funding</option>
                            </select>
                        </div>
                        <div style="max-width:220px;flex:1 1 200px">
                            <label>Grant Amount</label>
                            <input id="dt-amount" type="number" placeholder="0.00">
                        </div>
                        <div class="w-auto">
                            <button id="dt-save-amount" class="btn btn-primary">Save Amount & Status</button>
                        </div>
                        <div class="w-auto">
                            <button id="dt-approve" class="btn btn-success">Approve</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}


// In-modal toast (persist until modal closes)
export function notifyModal(message, type = "info", durationMs = 4000) {
    const wrap = $("dt-toasts");
    if (!wrap) return;
    const t = document.createElement("div");
    t.className = `modal-toast ${type}`;
    t.textContent = message;
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => { t.classList.remove("show"); setTimeout(() => t.remove(), 250); }, durationMs);
}

// Clear modal toasts
export function clearModalToasts() {
    const wrap = $("dt-toasts");
    if (!wrap) return;
    wrap.innerHTML = "";
}
