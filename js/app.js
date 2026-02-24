/**
 * Main Application Module
 *
 * This module handles password authentication, app state management,
 * navigation, and orchestrates all other modules.
 */

import { $, setText, esc, attr, showEl, notify } from './utils.js';
import { storage } from './storage.js';
import { mountSurveyUI, mountTrackerUI, mountApprovedUI, mountModal } from './ui-builders.js';
import { renderDashboard, renderReviewerDashboard } from './dashboard.js';
import {
    renderData,
    autoDetectMatchColumn,
    setMatchColumn,
    updateMatchControlsUI,
    app_toggleHideDataRow,
    deleteActiveTab,
    downloadActiveCSV,
    uploadXLSX
} from './data.js';
import {
    findProposalUrlByName,
    updateSurveyProposalLink,
    renderSurvey,
    submitSurvey,
    exportSurveys,
    refreshSurveyTypeahead,
    updateSurveyProjectMeta,
    autofillReviewerName
} from './survey.js';
import {
    renderTracker,
    openAutoAssignModal,
    closeAutoAssignModal,
    runAutoAssign,
    sendTrackerReminderEmails,
    clearAllAssignments
} from './tracker.js';
import { renderApproved, exportApproved, remapApproved } from './approved.js';
import { openDetail } from './modal.js';

const USE_EMAIL_AUTH = true;
const ADMIN_SECTIONS = new Set(["Data", "Approved", "Admin"]);
const ADMIN_EMAIL_HINTS = ["karen"];

// === Firebase Auth ===
let bootPromise = null;
function initAuth() {
    if (!USE_EMAIL_AUTH) return;
    $("authGo").onclick = handleSignIn;
    const passwordInput = $("authPassword");
    if (passwordInput) passwordInput.addEventListener("keypress", e => { if (e.key === "Enter") handleSignIn(); });
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            app.user = user;
            await setUserRole(user);
            $("authEmail").value = "";
            $("authPassword").value = "";
            showEl("auth", false);
            $("user-pill") && ($("user-pill").textContent = user.displayName || user.email || "Signed in");
            if (!bootPromise) {
                bootPromise = boot();
            } else {
                renderTop();
            }
        } else {
            app.user = null;
            app.role = "member";
            app.isAdmin = false;
            applyRoleGates();
            showEl("auth", true);
            $("user-pill") && ($("user-pill").textContent = "Not signed in");
        }
    });
}

async function handleSignIn() {
    const email = ($("authEmail")?.value || "").trim();
    const password = $("authPassword")?.value || "";
    const err = $("authErr");
    if (!email || !password) {
        if (err) { err.style.display = "block"; err.textContent = "Enter email and password."; }
        return;
    }
    try {
        await firebase.auth().signInWithEmailAndPassword(email, password);
        if (err) err.style.display = "none";
    } catch (e) {
        if (err) {
            err.style.display = "block";
            err.textContent = e?.message || "Sign-in failed";
        }
    }
}

function handleSignOut() {
    firebase.auth().signOut();
}

async function setUserRole(user) {
    app.role = "member";
    app.isAdmin = false;
    if (!user) {
        applyRoleGates();
        return;
    }
    // Load admin config if missing
    if (!app.adminConfig) {
        try {
            app.adminConfig = await storage.loadAdminConfig();
        } catch (err) {
            console.warn("Failed to load admin config", err);
            app.adminConfig = {};
        }
    }
    try {
        const token = await user.getIdTokenResult();
        const claimRole = token?.claims?.role || (Array.isArray(token?.claims?.roles) ? token.claims.roles[0] : null);
        const email = (user.email || "").toLowerCase();
        const adminEmails = Array.isArray(app.adminConfig?.emails) ? app.adminConfig.emails.map(e => (e || "").toLowerCase()) : [];
        const hinted = ADMIN_EMAIL_HINTS.some(h => email.includes(h));
        const inList = adminEmails.includes(email);
        const resolvedRole = claimRole || inList ? "admin" : (hinted ? "admin" : "member");
        app.role = resolvedRole;
        app.isAdmin = resolvedRole === "admin";
    } catch (err) {
        console.warn("Failed to resolve user role, defaulting to member", err);
        app.role = "member";
        app.isAdmin = false;
    }
    applyRoleGates();
}

function initLocalAuth() {
    if (USE_EMAIL_AUTH) return;
    const access = async () => {
    const input = ($("pass")?.value || "").trim();
    if (input === "eef2025") {
        app.user = app.user || { displayName: "Local Tester", email: "local@test" };
        app.role = "admin";
        app.isAdmin = true;
        app.adminConfig = app.adminConfig || {};
        applyRoleGates();
        showEl("auth", false);
        $("user-pill") && ($("user-pill").textContent = "Local mode");
        if (!bootPromise) {
            bootPromise = boot();
            }
        } else {
            const err = $("authErr");
            if (err) {
                err.style.display = "block";
                err.textContent = "Incorrect password";
                setTimeout(() => (err.style.display = "none"), 2000);
            }
        }
    };
    $("authGo")?.addEventListener("click", access);
    $("pass")?.addEventListener("keypress", (e) => { if (e.key === "Enter") access(); });
}

// === App state ===
const app = {
    tabs: [], selectedId: null,
    user: null,
    role: "member",
    isAdmin: false,
    surveys: [], assignments: {}, // <- current dataset's assignments map
    approved: { headers: ["Project Name", "Email", "Requested Amount", "Given Amount", "Funding Status", "Notes"], data: [] },
    proposalAmounts: {}, proposalNotes: {}, proposalStatus: {}, proposalDue: {},
    editingSurveyId: null, assigneeQuery: "",
    autoAssignConfig: { meetingDates: [], reviewerCount: 2, reviewerPool: [] },
    reviewerDirectory: {},
    assignmentOverflow: new Set(),
    lastReloadAt: null,
    dataFilters: {},
    dataSearch: "",
    pinnedColumns: new Set(),
    currentView: "Dashboard",
    adminConfig: null,
    lastReminderMessage: "",
    _currentProject: null,
    get activeTab() { return this.tabs.find(t => t.id === this.selectedId) || null; },
    isAmountHeader: h => /amount|requested|price|cost|budget|funds?/i.test(String(h || "")),
};

function boundOpenDetail(project) {
    openDetail(project, app, renderApproved, refreshTracker, renderDashboard);
}

function refreshTracker() {
    renderTracker(app, renderReviewerDashboard, boundOpenDetail);
}

// Make app globally accessible for legacy code
window.app = app;

// === Build header controls (dataset select + pill) ===
(function ensureHeaderControls() {
    const bar = document.querySelector("header .bar");
    if (!bar || document.getElementById("selDataset")) return;
    const wrap = document.createElement("div");
    wrap.className = "top-controls flex gap-10";
    wrap.style.alignItems = "center";
    wrap.innerHTML = `
        <span id="pill" class="pill">Dataset: (none)</span>
        <select id="selDataset" class="select-compact" style="width:220px;flex:0 0 auto;"></select>
        <div class="dataset-meta">
            <span id="dataset-refresh">Last refresh: —</span>
            <span id="dataset-rows">Rows: —</span>
        </div>
        <div class="dataset-actions" data-admin-only="true">
            <button id="dataset-duplicate" class="btn btn-sm">Duplicate</button>
            <button id="dataset-archive" class="btn btn-sm btn-danger">Archive</button>
        </div>
        <div class="user-controls">
            <span id="user-pill" class="pill pill-muted">Not signed in</span>
            <button id="signOut" class="btn btn-sm">Sign out</button>
        </div>
    `;
    bar.appendChild(wrap);
})();

// === Boot (dataset-scoped loads) ===
async function boot() {
    mountSurveyUI();
    mountTrackerUI();
    mountApprovedUI();
    mountModal();

    ["Dashboard", "Data", "Survey", "Tracker", "Approved", "Admin"].forEach(n => {
        $("tab-" + n).onclick = () => showSection(n);
    });

    // Load tabs, UI config, and the reviewer directory used for email reminders
    const [tabs, ui, reviewerDirectory, adminConfig] = await Promise.all([
        storage.loadTabs(),
        storage.loadUIConfig(),
        storage.loadReviewerDirectory(),
        storage.loadAdminConfig(),
    ]);

    app.tabs = tabs;
    app.reviewerDirectory = reviewerDirectory || {};
    app.adminConfig = adminConfig || {};

    const savedId = ui?.selectedDatasetId;
    app.selectedId = (savedId && app.tabs.some(t => t.id === savedId))
        ? savedId
        : (app.tabs[0]?.id || null);

    // Load everything *within* the selected dataset
    await reloadCurrentDataset(); // fills surveys, assignments, approved, proposal meta

    bindUI();
    renderAll();
    notify("EEF Manager Ready", "success");
}

// Reload only the active dataset's data (single implementation)
async function reloadCurrentDataset() {
    const id = app.selectedId;
    if (!id) {
        app.surveys = [];
        app.assignments = {};
        app.approved.data = [];
        app.proposalAmounts = {};
        app.proposalNotes = {};
        app.proposalStatus = {};
        app.proposalDue = {};
        renderAll();
        app.lastReloadAt = new Date();
        return;
    }
    const [surveys, assignmentPayload, approvedRows, meta] = await Promise.all([
        storage.loadSurveys(id),
        storage.loadAssignments(id),
        storage.loadApprovedData(id),
        storage.loadProposalMeta(id),
    ]);

    app.surveys = surveys;
    app.assignments = assignmentPayload.assignments || {}; // scoped to current dataset
    app.assignmentOverflow = new Set(assignmentPayload.overflow || []);
    app.approved.data = approvedRows;
    app.proposalAmounts = meta.amounts;
    app.proposalNotes = meta.notes;
    app.proposalStatus = meta.status;
    app.proposalDue = meta.due;
    app.lastReloadAt = new Date();
    renderAll();
    notify(`Dataset "${app.activeTab?.name || id}" reloaded`, "info");
}

// === Navigation + Render orchestration ===
function showSection(name) {
    if (!app.isAdmin && ADMIN_SECTIONS.has(name)) {
        notify("Admins only", "error");
        name = "Dashboard";
    }
    app.currentView = name;
    const ids = ["Dashboard", "Data", "Survey", "Tracker", "Approved", "Admin"];
    ids.forEach(n => {
        const el = document.getElementById("view-" + n);
        if (el) el.classList.toggle("hidden", n !== name);
        const tabBtn = document.getElementById("tab-" + n);
        if (tabBtn) tabBtn.classList.toggle("active", n === name);
    });
    renderTop();
    if (name === "Dashboard") renderDashboard(app);
    if (name === "Data" && app.isAdmin) renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink);
    if (name === "Survey") {
        renderSurvey(app, ($("svy-filter")?.value || "").trim().toLowerCase());
        updateSurveyProposalLink(app, findProposalUrlByName);
        refreshSurveyTypeahead(app);
        updateSurveyProjectMeta(app, ($("svy-projectName")?.value || "").trim());
        autofillReviewerName(app);
    }
    if (name === "Tracker") refreshTracker();
    if (name === "Approved" && app.isAdmin) renderApproved(app, openDetail);
    if (name === "Admin" && app.isAdmin) renderAdminSettings();
}

// Make showSection globally accessible
window.showSection = showSection;

function renderAll() {
    renderTop();
    renderDashboard(app);
    if (app.isAdmin) {
        renderData(app, setMatchColumn, updateMatchControlsUI, updateSurveyProposalLink);
    }
    renderSurvey(app, "");
    refreshSurveyTypeahead(app);
    updateSurveyProposalLink(app, findProposalUrlByName);
    updateSurveyProjectMeta(app, ($("svy-projectName")?.value || "").trim());
    autofillReviewerName(app);
    refreshTracker();
    if (app.isAdmin) {
        renderApproved(app, openDetail);
        renderAdminSettings();
    }
    applyRoleGates();
}

function renderAdminSettings() {
    const emailsArea = $("admin-emails");
    const meta = $("admin-emails-meta");
    const reviewersArea = $("admin-reviewers");
    const revMeta = $("admin-reviewer-meta");
    const emailList = $("admin-emails-list");
    const reviewerList = $("admin-reviewers-list");
    const emails = Array.isArray(app.adminConfig?.emails) ? app.adminConfig.emails : [];
    const dir = app.reviewerDirectory || {};

    if (emailList) {
        if (!emails.length) {
            emailList.innerHTML = `<div class="text-muted text-sm">No admin emails yet. Click "Add Admin Email".</div>`;
        } else {
            emailList.innerHTML = emails.map(e => `
                <div class="admin-row">
                    <div>${esc(e)}</div>
                    <div class="admin-row-actions">
                        <button class="btn btn-xs" data-action="edit-admin" data-email="${attr(e)}">Edit</button>
                        <button class="btn btn-xs btn-danger" data-action="delete-admin" data-email="${attr(e)}">Delete</button>
                    </div>
                </div>`).join("");
        }
    }
    if (meta) meta.textContent = `${emails.length} admin${emails.length === 1 ? "" : "s"}`;

    if (reviewerList) {
        const entries = Object.entries(dir);
        if (!entries.length) {
            reviewerList.innerHTML = `<div class="text-muted text-sm">No reviewers yet. Click "Add Reviewer".</div>`;
        } else {
            reviewerList.innerHTML = entries.map(([name, email]) => `
                <div class="admin-row">
                    <div><strong>${esc(name)}</strong><span class="text-muted" style="margin-left:8px">${esc(email || "")}</span></div>
                    <div class="admin-row-actions">
                        <button class="btn btn-xs" data-action="edit-reviewer" data-name="${attr(name)}" data-email="${attr(email || "")}">Edit</button>
                        <button class="btn btn-xs btn-danger" data-action="delete-reviewer" data-name="${attr(name)}">Delete</button>
                    </div>
                </div>`).join("");
        }
    }
    if (revMeta) revMeta.textContent = `${Object.keys(dir).length} reviewer${Object.keys(dir).length === 1 ? "" : "s"}`;
}

function parseEmails(raw) {
    return (raw || "")
        .split(/\n|,/)
        .map(e => (e || "").trim().toLowerCase())
        .filter(Boolean);
}

function parseReviewerDirectory(raw) {
    const lines = (raw || "").split(/\n+/).map(l => l.trim()).filter(Boolean);
    const dir = {};
    lines.forEach(line => {
        // allow "Name, email" or "Name <email>"
        const emailMatch = line.match(/<([^>]+)>/);
        let email = emailMatch ? emailMatch[1] : "";
        if (!email) {
            const parts = line.split(",").map(p => p.trim()).filter(Boolean);
            if (parts.length >= 2) {
                email = parts.pop();
                const name = parts.join(", ");
                if (name) dir[name] = email;
                return;
            }
        }
        if (email) {
            const namePart = line.replace(emailMatch ? emailMatch[0] : email, "").replace(/[<>]/g, "").trim().replace(/,$/, "");
            const name = namePart || email.split("@")[0];
            if (name) dir[name] = email;
        }
    });
    return dir;
}

async function saveAdminEmails() {
    if (!app.isAdmin) return notify("Admin only", "error");
    const raw = $("admin-emails")?.value || "";
    const emails = parseEmails(raw);
    await storage.saveAdminConfig({ emails });
    app.adminConfig = app.adminConfig || {};
    app.adminConfig.emails = emails;
    renderAdminSettings();
    notify("Admin emails saved", "success");
}

async function saveReviewerDirectory() {
    if (!app.isAdmin) return notify("Admin only", "error");
    const raw = $("admin-reviewers")?.value || "";
    const dir = parseReviewerDirectory(raw);
    await storage.saveReviewerDirectory(dir);
    app.reviewerDirectory = dir;
    renderAdminSettings();
    notify("Reviewer directory saved", "success");
}

let adminModalMode = "admin";
let adminEditKey = null;
function openAdminEntryModal(mode = "admin", payload = {}) {
    adminModalMode = mode === "reviewer" ? "reviewer" : "admin";
    adminEditKey = payload?.key || null;
    const modal = $("admin-modal");
    if (!modal) return;
    const title = $("admin-modal-title");
    const subtitle = $("admin-modal-subtitle");
    const nameWrap = $("admin-name-wrap");
    const nameInput = $("admin-modal-name");
    const emailInput = $("admin-modal-email");
    if (nameInput) nameInput.value = payload?.name || "";
    if (emailInput) emailInput.value = payload?.email || "";
    if (adminModalMode === "admin") {
        if (title) title.textContent = "Add Admin Email";
        if (subtitle) subtitle.textContent = "Grant admin access by email";
        if (nameWrap) nameWrap.style.display = "none";
    } else {
        if (title) title.textContent = "Add Reviewer";
        if (subtitle) subtitle.textContent = "Add a reviewer name and email";
        if (nameWrap) nameWrap.style.display = "";
    }
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    (emailInput || nameInput)?.focus();
}

function closeAdminEntryModal() {
    const modal = $("admin-modal");
    if (!modal) return;
    modal.classList.add("hidden");
    document.body.style.overflow = "";
}

async function saveAdminEntry() {
    if (!app.isAdmin) return notify("Admin only", "error");
    const email = ($("admin-modal-email")?.value || "").trim().toLowerCase();
    const name = ($("admin-modal-name")?.value || "").trim();
    if (!email) return notify("Email is required", "error");

    if (adminModalMode === "admin") {
        const list = Array.isArray(app.adminConfig?.emails) ? [...app.adminConfig.emails] : [];
        if (adminEditKey) {
            const idx = list.indexOf(adminEditKey);
            if (idx !== -1) list[idx] = email;
            else if (!list.includes(email)) list.push(email);
        } else if (!list.includes(email)) {
            list.push(email);
        }
        await storage.saveAdminConfig({ emails: list });
        app.adminConfig = app.adminConfig || {};
        app.adminConfig.emails = list;
        renderAdminSettings();
        notify(adminEditKey ? "Admin email updated" : "Admin email added", "success");
    } else {
        const dir = { ...(app.reviewerDirectory || {}) };
        const key = name || email.split("@")[0];
        if (adminEditKey && adminEditKey !== key) {
            delete dir[adminEditKey];
        }
        dir[key] = email;
        await storage.saveReviewerDirectory(dir);
        app.reviewerDirectory = dir;
        renderAdminSettings();
        notify(adminEditKey ? "Reviewer updated" : "Reviewer added", "success");
    }
    closeAdminEntryModal();
    adminEditKey = null;
}

function handleAdminListClick(e) {
    const action = e.target?.dataset?.action;
    if (!action) return;
    const email = e.target.dataset.email || "";
    if (action === "edit-admin") {
        openAdminEntryModal("admin", { email, key: email });
    } else if (action === "delete-admin") {
        const list = Array.isArray(app.adminConfig?.emails) ? [...app.adminConfig.emails] : [];
        const next = list.filter(x => x !== email);
        storage.saveAdminConfig({ emails: next }).then(() => {
            app.adminConfig.emails = next;
            renderAdminSettings();
            notify("Admin email removed", "success");
        });
    }
}

function handleReviewerListClick(e) {
    const action = e.target?.dataset?.action;
    if (!action) return;
    const name = e.target.dataset.name || "";
    const email = e.target.dataset.email || "";
    if (action === "edit-reviewer") {
        openAdminEntryModal("reviewer", { name, email, key: name });
    } else if (action === "delete-reviewer") {
        const dir = { ...(app.reviewerDirectory || {}) };
        delete dir[name];
        storage.saveReviewerDirectory(dir).then(() => {
            app.reviewerDirectory = dir;
            renderAdminSettings();
            notify("Reviewer removed", "success");
        });
    }
}

function renderTop() {
    const sel = $("selDataset");
    if (sel) {
        sel.innerHTML = app.tabs.map(t => `<option value="${attr(t.id)}">${esc(t.name)}</option>`).join("");
        sel.value = app.selectedId || "";
    }
    const pill = $("pill");
    if (pill) pill.textContent = "Dataset: " + (app.activeTab ? app.activeTab.name : "(none)");
    const rows = $("dataset-rows");
    if (rows) {
        const rowCount = Array.isArray(app.activeTab?.data) ? app.activeTab.data.length : (app.activeTab?.rowCount ?? 0);
        rows.textContent = "Rows: " + rowCount;
    }
    const refresh = $("dataset-refresh");
    if (refresh) {
        const ts = app.lastReloadAt ? new Date(app.lastReloadAt).toLocaleTimeString() : "—";
        refresh.textContent = "Last refresh: " + ts;
    }
    const archiveBtn = $("dataset-archive");
    if (archiveBtn) {
        archiveBtn.textContent = app.activeTab?.archived ? "Unarchive" : "Archive";
        archiveBtn.classList.toggle("btn-danger", !app.activeTab?.archived);
        archiveBtn.classList.toggle("btn-primary", !!app.activeTab?.archived);
    }
}

function applyRoleGates() {
    const isAdmin = !!app.isAdmin;

    // Toggle admin-only elements
    document.querySelectorAll("[data-admin-only]").forEach(el => {
        el.style.display = isAdmin ? "" : "none";
    });

    // Tabs and views
    const dataTab = $("tab-Data");
    const approvedTab = $("tab-Approved");
    const adminTab = $("tab-Admin");
    if (dataTab) dataTab.style.display = isAdmin ? "" : "none";
    if (approvedTab) approvedTab.style.display = isAdmin ? "" : "none";
    if (adminTab) adminTab.style.display = isAdmin ? "" : "none";

    const dataView = $("view-Data");
    const approvedView = $("view-Approved");
    const adminView = $("view-Admin");
    if (dataView && !isAdmin) dataView.classList.add("hidden");
    if (approvedView && !isAdmin) approvedView.classList.add("hidden");
    if (adminView && !isAdmin) adminView.classList.add("hidden");

    // If a non-admin somehow lands on an admin tab, bounce them back
    const activeTab = document.querySelector(".tabs button.active");
    const activeName = activeTab ? activeTab.id.replace("tab-", "") : app.currentView;
    if (!isAdmin && ADMIN_SECTIONS.has(activeName)) {
        showSection("Dashboard");
    }
}

// === Bind UI ===
function bindUI() {
    // Dashboard
    $("upload").onclick = () => uploadXLSX(app, autoDetectMatchColumn, reloadCurrentDataset, renderAll);

    // Data
    $("dl-csv").onclick = () => downloadActiveCSV(app);
    $("del-tab").onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        deleteActiveTab(app, reloadCurrentDataset, renderAll);
    };

    // Survey submit
    const form = $("survey");
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const fd = new FormData(form);
            await submitSurvey(fd, app, renderSurvey, refreshTracker, renderDashboard, updateSurveyProposalLink);
            notify("Review submitted", "success");
        };
    }
    const handleProjectInput = (value) => {
        const name = (value || "").trim();
        if ($("svy-filter")) $("svy-filter").value = name;
        updateSurveyProposalLink(app, findProposalUrlByName);
        renderSurvey(app, name.toLowerCase());
        updateSurveyProjectMeta(app, name);
    };
    $("survey-container").addEventListener("input", (e) => {
        if (e.target && e.target.id === "svy-projectName") handleProjectInput(e.target.value);
    });
    $("survey-container").addEventListener("change", (e) => {
        if (e.target && e.target.id === "svy-projectName") handleProjectInput(e.target.value);
    });
    const reviewerInput = document.querySelector("#survey input[name='reviewerName']");
    if (reviewerInput) reviewerInput.addEventListener("input", () => reviewerInput.dataset.autofill = "0");
    $("svy-do").onclick = () => renderSurvey(app, ($("svy-filter")?.value || "").trim().toLowerCase());
    $("svy-clr").onclick = () => { $("svy-filter").value = ""; renderSurvey(app, ""); };
    $("svy-exp").onclick = () => exportSurveys(app);

    // Dataset selector with inline rename on double-click
    const sel = $("selDataset");
    if (sel) {
        sel.onchange = async () => {
            await switchDataset(sel.value);
        };

        // Inline rename
        sel.addEventListener("dblclick", async () => {
            const tabId = sel.value;
            if (!tabId) return;
            const currentName = sel.options[sel.selectedIndex].text;
            const input = document.createElement("input");
            input.type = "text"; input.value = currentName; input.className = "input";
            input.style.width = "180px"; input.style.marginLeft = "8px";
            sel.style.display = "none";
            sel.parentNode.insertBefore(input, sel.nextSibling);
            input.focus();

            const saveName = async () => {
                const newName = input.value.trim();
                if (newName && newName !== currentName) {
                    await db.collection("tabs").doc(tabId).set({ datasetName: newName, name: newName }, { merge: true });
                    const tab = app.tabs.find(t => t.id === tabId);
                    if (tab) tab.name = newName;
                    sel.options[sel.selectedIndex].text = newName;
                    notify(`Dataset renamed to "${newName}"`, "success");
                    renderTop();
                }
                input.remove(); sel.style.display = "";
            };

            input.addEventListener("blur", saveName);
            input.addEventListener("keydown", (ev) => {
                if (ev.key === "Enter") saveName();
                if (ev.key === "Escape") { input.remove(); sel.style.display = ""; }
            });
        });
    }
    const dupBtn = $("dataset-duplicate");
    if (dupBtn) dupBtn.onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        duplicateActiveDataset(app, reloadCurrentDataset, renderAll);
    };
    const archiveBtn = $("dataset-archive");
    if (archiveBtn) archiveBtn.onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        toggleArchiveActiveDataset(app, renderTop);
    };
    const signOutBtn = $("signOut");
    if (signOutBtn) {
        if (USE_EMAIL_AUTH) signOutBtn.onclick = handleSignOut;
        else signOutBtn.style.display = "none";
    }

    // Tracker
    $("trk-refresh").onclick = refreshTracker;
    const autoBtn = $("trk-auto");
    if (autoBtn) autoBtn.onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        openAutoAssignModal(app);
    };
    const emailBtn = $("trk-email");
    if (emailBtn) emailBtn.onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        sendTrackerReminderEmails(app);
    };
    ["auto-close", "auto-cancel"].forEach(id => {
        const btn = $(id);
        if (btn) btn.onclick = () => closeAutoAssignModal();
    });
    const autoRun = $("auto-run");
    if (autoRun) autoRun.onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        runAutoAssign(
            app,
            refreshTracker,
            () => renderDashboard(app)
        );
    };
    const autoClear = $("auto-clear");
    if (autoClear) autoClear.onclick = () => {
        if (!app.isAdmin) return notify("Admin only", "error");
        clearAllAssignments(app, refreshTracker, () => renderDashboard(app));
    };

    // Admin settings
    // Admin settings
const addAdminBtn = $("admin-emails-add");
if (addAdminBtn) addAdminBtn.onclick = () => openAdminEntryModal("admin");

const addReviewerBtn = $("admin-reviewers-add");
if (addReviewerBtn) addReviewerBtn.onclick = () => openAdminEntryModal("reviewer");

// ✅ BIND IMPORT BUTTON HERE
const importReviewerBtn = $("admin-reviewers-import");
if (importReviewerBtn) importReviewerBtn.onclick = () => importReviewerEmailsBlankNames();

const adminEmailList = $("admin-emails-list");
if (adminEmailList) adminEmailList.onclick = handleAdminListClick;

const reviewerList = $("admin-reviewers-list");
if (reviewerList) reviewerList.onclick = handleReviewerListClick;
    ["admin-modal-close", "admin-modal-cancel"].forEach(id => {
        const btn = $(id);
        if (btn) btn.onclick = closeAdminEntryModal;
    });
    const adminModalSave = $("admin-modal-save");
    if (adminModalSave) adminModalSave.onclick = saveAdminEntry;
    $("trk-q").oninput = (e) => { app.assigneeQuery = (e.target.value || "").toLowerCase(); refreshTracker(); };
    $("trk-q-clr").onclick = () => { app.assigneeQuery = ""; $("trk-q").value = ""; refreshTracker(); };

    // Approved
    $("ap-exp").onclick = () => exportApproved(app);
    if ($("ap-remap")) $("ap-remap").onclick = () => remapApproved(app, renderApproved, renderDashboard);

    // Combined header shadows on scroll (single handler)
    document.addEventListener("scroll", (ev) => {
        const wrapTracker = document.querySelector("#view-Tracker .table-wrap");
        if (wrapTracker) wrapTracker.classList.toggle("scrolled", wrapTracker.scrollTop > 2);
        const wrapData = document.querySelector("#view-Data .table-wrap");
        if (wrapData) wrapData.classList.toggle("scrolled", wrapData.scrollTop > 2);
    }, true);
}

async function switchDataset(id) {
    if (!id || id === app.selectedId) return;
    app.selectedId = id;
    app.dataFilters = {};
    app.dataSearch = "";
    await storage.saveUIConfig({ selectedDatasetId: app.selectedId });
    await reloadCurrentDataset();
    renderAll();
    updateSurveyProposalLink(app, findProposalUrlByName);
}

async function duplicateActiveDataset(app, reloadCurrentDataset, renderAll) {
    if (!app.isAdmin) return notify("Admin only", "error");
    const tab = app.activeTab;
    if (!tab) return notify("No dataset selected", "error");
    const clone = JSON.parse(JSON.stringify(tab));
    clone.id = "dt_" + Date.now();
    clone.name = `${tab.name} Copy`;
    clone.created = new Date().toISOString();
    clone.archived = false;
    await storage.saveTab(clone);
    app.tabs = await storage.loadTabs();
    app.selectedId = clone.id;
    await storage.saveUIConfig({ selectedDatasetId: clone.id });
    await reloadCurrentDataset();
    renderAll();
    notify(`Duplicated "${tab.name}"`, "success");
}

async function toggleArchiveActiveDataset(app, renderTopFn) {
    if (!app.isAdmin) return notify("Admin only", "error");
    const tab = app.activeTab;
    if (!tab) return notify("No dataset selected", "error");
    const nextState = !tab.archived;
    if (!confirm(`${nextState ? "Archive" : "Restore"} dataset "${tab.name}"?`)) return;
    tab.archived = nextState;
    tab.archivedAt = nextState ? new Date().toISOString() : null;
    await storage.saveTab(tab);
    app.tabs = await storage.loadTabs();
    const msg = nextState ? "Dataset archived" : "Dataset restored";
    notify(msg, nextState ? "info" : "success");
    renderTopFn();
}

// Make global functions accessible for window calls
window.app_toggleHideDataRow = (rowIndex) => app_toggleHideDataRow(rowIndex, app, renderData, refreshTracker);
window.app_openDetailFromData = (project) => {
    showSection("Tracker");
    boundOpenDetail(project);
};
window.openDetail = boundOpenDetail;

// === Event listeners on load ===
document.addEventListener("DOMContentLoaded", () => {
    if (USE_EMAIL_AUTH) initAuth();
    else initLocalAuth();
});

// Export app for other modules
export default app;
